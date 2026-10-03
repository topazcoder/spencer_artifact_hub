import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorCode, type ShareLink as ShareLinkDto } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource, IsNull, type Repository } from 'typeorm';
import { AccessPolicyService } from '../../access/access-policy.service.js';
import type { LinkDenialReason } from '../../access/access.types.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  generateSecretToken,
  hashSecretToken,
  SECRET_TOKEN_PATTERN,
} from '../../common/tokens/secret-tokens.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { isUniqueViolation } from '../../database/postgres-errors.js';
import { InjectStorage } from '../../storage/storage.module.js';
import type { StorageDriver } from '../../storage/storage.types.js';
import { LinkTokenCipherService } from './link-token-cipher.service.js';
import { ShareLink } from './share-link.entity.js';
import type { LinkSettings, OpenedLink } from './share-links.types.js';

const LIVE_LINK_INDEX = 'share_links_live_artifact_id_key';

/** What someone holding a link that no longer works is told. */
const DENIAL_ERRORS: Record<LinkDenialReason | 'unknown', [ErrorCode, string]> = {
  unknown: [ErrorCode.NOT_FOUND, "This link doesn't work."],
  artifact_gone: [ErrorCode.NOT_FOUND, "This link doesn't work."],
  revoked: [ErrorCode.SHARE_REVOKED, 'This link was turned off.'],
  expired: [ErrorCode.SHARE_EXPIRED, 'This link has expired.'],
};

/**
 * Share links for people outside the company (plan §1, S6): one live link per artifact,
 * working without sign-in while `AccessPolicy.linkDenialReason` allows. The owner-facing
 * methods trust the caller to have checked that the actor may share the artifact.
 */
@Injectable()
export class ShareLinksService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ShareLink) private readonly links: Repository<ShareLink>,
    private readonly cipher: LinkTokenCipherService,
    private readonly access: AccessPolicyService,
    @InjectStorage() private readonly storage: StorageDriver,
    @InjectEnv() private readonly env: Env,
    @InjectPinoLogger(ShareLinksService.name) private readonly logger: PinoLogger,
  ) {}

  /** The artifact's live link as its owner sees it (URL included), or null. */
  async liveLinkOf(artifactId: string): Promise<ShareLinkDto | null> {
    const link = await this.links.findOne({
      where: { artifactId, revokedAt: IsNull() },
      relations: { pinnedVersion: true },
    });
    return link ? this.toDto(link) : null;
  }

  /** Turns the link on, or changes its expiry or version while keeping its URL. */
  async set(actorId: string, artifactId: string, settings: LinkSettings): Promise<void> {
    const changes = {
      expiresAt: settings.expiresAt,
      pinnedVersionId: settings.pinnedVersion?.id ?? null,
    };
    const { affected } = await this.links.update({ artifactId, revokedAt: IsNull() }, changes);
    let turnedOn = false;
    if (!affected) {
      try {
        await this.links.insert({ ...this.newToken(), artifactId, createdBy: actorId, ...changes });
        turnedOn = true;
      } catch (error) {
        // Turned on by a concurrent request: change that one instead.
        if (!isUniqueViolation(error, LIVE_LINK_INDEX)) throw error;
        await this.links.update({ artifactId, revokedAt: IsNull() }, changes);
      }
    }
    this.logger.info(
      {
        userId: actorId,
        artifactId,
        expiresAt: settings.expiresAt,
        pinnedVersionNo: settings.pinnedVersion?.versionNo ?? null,
      },
      turnedOn ? 'Share link turned on' : 'Share link changed',
    );
  }

  /** Turns the link off; it stops working at once. Turning it off again does nothing. */
  async turnOff(actorId: string, artifactId: string): Promise<void> {
    const { affected } = await this.links.update(
      { artifactId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    if (affected) this.logger.info({ userId: actorId, artifactId }, 'Share link turned off');
  }

  /** Replaces the link with a new URL and the same settings; the old URL stops working. */
  async reset(actorId: string, artifactId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const live = await manager.findOne(ShareLink, {
        where: { artifactId, revokedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!live) throw new AppError(ErrorCode.NOT_FOUND, 'There is no link to reset.');
      await manager.update(ShareLink, live.id, { revokedAt: new Date() });
      await manager.insert(ShareLink, {
        ...this.newToken(),
        artifactId,
        createdBy: actorId,
        expiresAt: live.expiresAt,
        pinnedVersionId: live.pinnedVersionId,
      });
    });
    this.logger.info({ userId: actorId, artifactId }, 'Share link reset');
  }

  /**
   * What a link shows, for anyone holding it: its artifact and version, with a way to read the
   * content. `NOT_FOUND`, `SHARE_REVOKED` or `SHARE_EXPIRED` once it no longer works.
   */
  async open(token: string): Promise<OpenedLink> {
    const link = SECRET_TOKEN_PATTERN.test(token)
      ? await this.links.findOne({
          where: { tokenHash: hashSecretToken(token) },
          relations: { artifact: { owner: true, currentVersion: true }, pinnedVersion: true },
        })
      : null;
    if (!link) throw this.deny('unknown');
    const reason = this.access.linkDenialReason(link);
    if (reason) throw this.deny(reason, link);

    const version = link.pinnedVersion ?? link.artifact.currentVersion;
    // A published artifact always has a current version.
    if (!version) throw this.deny('artifact_gone', link);
    return {
      link,
      artifact: link.artifact,
      version,
      open: () => this.storage.getStream(version.storageKey),
    };
  }

  private newToken(): Pick<ShareLink, 'tokenHash' | 'tokenCiphertext'> {
    const token = generateSecretToken();
    return { tokenHash: hashSecretToken(token), tokenCiphertext: this.cipher.seal(token) };
  }

  private toDto(link: ShareLink): ShareLinkDto {
    return {
      url: `${this.env.APP_BASE_URL}/s/${this.cipher.open(link.tokenCiphertext)}`,
      pinnedVersionNo: link.pinnedVersion?.versionNo ?? null,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      createdAt: link.createdAt.toISOString(),
    };
  }

  /** Logs a link that didn't open, and returns the error for whoever holds it. */
  private deny(reason: LinkDenialReason | 'unknown', link?: ShareLink): AppError {
    this.logger.info(
      { linkId: link?.id, artifactId: link?.artifactId, reason },
      'Share link refused',
    );
    const [code, message] = DENIAL_ERRORS[reason];
    return new AppError(code, message);
  }
}
