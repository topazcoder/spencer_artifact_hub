import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type ArtifactAccess,
  ErrorCode,
  type SetCompanyAccessOptions,
  type SetShareLinkOptions,
  type SharePeopleOptions,
  type UnknownRecipientsDetails,
  type UpdatePersonAccessOptions,
} from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, type Repository } from 'typeorm';
import { z } from 'zod';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { Artifact } from '../artifacts/artifact.entity.js';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { User } from '../users/user.entity.js';
import { ShareLinksService } from './links/share-links.service.js';
import { Share, toSharedPersonDto } from './share.entity.js';

const idSchema = z.guid();

/**
 * Who besides the owner may see an artifact (plan §1, §4): people by name, everyone at the
 * company, and anyone with the link; each shows all versions or a pinned one. Owner only.
 * Whether access is granted is decided per request by `AccessPolicy`, so every change takes
 * effect at once.
 */
@Injectable()
export class SharingService {
  constructor(
    @InjectRepository(Share) private readonly shares: Repository<Share>,
    @InjectRepository(Artifact) private readonly artifacts: Repository<Artifact>,
    @InjectRepository(ArtifactVersion) private readonly versions: Repository<ArtifactVersion>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly artifactsService: ArtifactsService,
    private readonly links: ShareLinksService,
    @InjectPinoLogger(SharingService.name) private readonly logger: PinoLogger,
  ) {}

  async getAccess(actor: Actor, artifactId: string): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    return this.accessOf(artifact.id);
  }

  /** Turns "Everyone at the company" on (showing `versionNo`, or the latest) or off. */
  async setCompanyAccess(
    actor: Actor,
    artifactId: string,
    { enabled, versionNo }: SetCompanyAccessOptions,
  ): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    const pinned = enabled ? await this.versionToPin(artifact.id, versionNo) : null;
    await this.artifacts.update(artifact.id, {
      visibility: enabled ? 'public' : 'private',
      publicPinnedVersionId: pinned?.id ?? null,
    });
    this.logger.info(
      {
        userId: actor.userId,
        artifactId: artifact.id,
        enabled,
        pinnedVersionNo: pinned?.versionNo ?? null,
      },
      'Company access changed',
    );
    return this.accessOf(artifact.id);
  }

  /**
   * Gives each person `permission` on the version chosen. Everyone must have an account: if
   * any email is unknown, nobody is added and the error lists the unknown ones. People who
   * already have access get the new settings; the owner is skipped.
   */
  async sharePeople(
    actor: Actor,
    artifactId: string,
    { emails, permission, versionNo }: SharePeopleOptions,
  ): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    const pinned = await this.versionToPin(artifact.id, versionNo);

    const found = await this.users.findBy({ email: In(emails) });
    const known = new Set(found.map((user) => user.email.toLowerCase()));
    const unknownEmails = emails.filter((email) => !known.has(email));
    if (unknownEmails.length > 0) {
      const details: UnknownRecipientsDetails = { unknownEmails };
      throw new AppError(
        ErrorCode.SHARE_RECIPIENT_UNKNOWN,
        `No one at Artifact Hub has ${unknownEmails.length === 1 ? 'this email' : 'these emails'}: ${unknownEmails.join(', ')}.`,
        details,
      );
    }

    const recipients = found.filter((user) => user.id !== artifact.ownerId);
    if (recipients.length > 0) {
      await this.shares
        .createQueryBuilder()
        .insert()
        .values(
          recipients.map((user) => ({
            artifactId: artifact.id,
            userId: user.id,
            permission,
            pinnedVersionId: pinned?.id ?? null,
            createdBy: actor.userId,
          })),
        )
        .orUpdate(['permission', 'pinned_version_id', 'updated_at'], ['artifact_id', 'user_id'])
        .execute();
    }
    this.logger.info(
      {
        userId: actor.userId,
        artifactId: artifact.id,
        recipientIds: recipients.map((user) => user.id),
        permission,
        pinnedVersionNo: pinned?.versionNo ?? null,
      },
      'Shared with people',
    );
    return this.accessOf(artifact.id);
  }

  /** Changes what one person may do, or which version they see. */
  async updatePerson(
    actor: Actor,
    artifactId: string,
    userId: string,
    changes: UpdatePersonAccessOptions,
  ): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    const share = idSchema.safeParse(userId).success
      ? await this.shares.findOneBy({ artifactId: artifact.id, userId })
      : null;
    if (!share) throw new AppError(ErrorCode.NOT_FOUND, "This person doesn't have access.");

    const pinned =
      changes.versionNo === undefined
        ? undefined
        : await this.versionToPin(artifact.id, changes.versionNo);
    await this.shares.update(
      { artifactId: artifact.id, userId },
      {
        ...(changes.permission ? { permission: changes.permission } : {}),
        ...(pinned === undefined ? {} : { pinnedVersionId: pinned?.id ?? null }),
      },
    );
    this.logger.info(
      {
        userId: actor.userId,
        artifactId: artifact.id,
        recipientId: userId,
        permission: changes.permission,
        pinnedVersionNo: pinned === undefined ? undefined : (pinned?.versionNo ?? null),
      },
      'Share changed',
    );
    return this.accessOf(artifact.id);
  }

  /** Takes away one person's access, at once. Removing someone without access does nothing. */
  async removePerson(actor: Actor, artifactId: string, userId: string): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    if (idSchema.safeParse(userId).success) {
      const { affected } = await this.shares.delete({ artifactId: artifact.id, userId });
      if (affected) {
        this.logger.info(
          { userId: actor.userId, artifactId: artifact.id, recipientId: userId },
          'Share removed',
        );
      }
    }
    return this.accessOf(artifact.id);
  }

  /**
   * Turns on the link for people outside the company (no sign-in, view and download), or
   * changes its expiry or version while keeping its URL.
   */
  async setLink(
    actor: Actor,
    artifactId: string,
    { expiresAt, versionNo }: SetShareLinkOptions,
  ): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    const expiry = expiresAt === null ? null : new Date(expiresAt);
    if (expiry && expiry.getTime() <= Date.now()) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'expiresAt', message: 'Choose an expiry date in the future.' },
      ]);
    }
    const pinnedVersion = await this.versionToPin(artifact.id, versionNo);
    await this.links.set(actor.userId, artifact.id, { expiresAt: expiry, pinnedVersion });
    return this.accessOf(artifact.id);
  }

  async turnOffLink(actor: Actor, artifactId: string): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    await this.links.turnOff(actor.userId, artifact.id);
    return this.accessOf(artifact.id);
  }

  /** Gives the link a new URL; the old one stops working. `NOT_FOUND` if it is off. */
  async resetLink(actor: Actor, artifactId: string): Promise<ArtifactAccess> {
    const artifact = await this.artifactToShare(actor, artifactId);
    await this.links.reset(actor.userId, artifact.id);
    return this.accessOf(artifact.id);
  }

  /** The artifact, if the actor may share it (`NOT_FOUND` / `FORBIDDEN` otherwise). */
  private async artifactToShare(actor: Actor, artifactId: string): Promise<Artifact> {
    return (await this.artifactsService.getForAction(actor, artifactId, 'share')).artifact;
  }

  /** The version to pin for `versionNo`; null for the latest. */
  private async versionToPin(
    artifactId: string,
    versionNo: number | null,
  ): Promise<ArtifactVersion | null> {
    if (versionNo === null) return null;
    const version = await this.versions.findOneBy({ artifactId, versionNo });
    if (!version) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'versionNo', message: `There is no version ${versionNo}.` },
      ]);
    }
    return version;
  }

  private async accessOf(artifactId: string): Promise<ArtifactAccess> {
    const [artifact, people, link] = await Promise.all([
      this.artifacts.findOneOrFail({ where: { id: artifactId } }),
      this.shares.find({
        where: { artifactId },
        relations: { user: true, pinnedVersion: true },
        order: { createdAt: 'ASC', userId: 'ASC' },
      }),
      this.links.liveLinkOf(artifactId),
    ]);
    const companyPinned = artifact.publicPinnedVersionId
      ? await this.versions.findOneBy({ id: artifact.publicPinnedVersionId })
      : null;
    return {
      company: {
        enabled: artifact.visibility === 'public',
        pinnedVersionNo: companyPinned?.versionNo ?? null,
      },
      people: people.map(toSharedPersonDto),
      link,
    };
  }
}
