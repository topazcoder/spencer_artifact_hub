import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ErrorCode,
  type UploadSession as UploadSessionDto,
  type UploadSessionPurpose,
} from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IsNull, LessThan, MoreThan, type Repository } from 'typeorm';
import { ArtifactsService } from '../../artifacts/artifacts.service.js';
import type { ArtifactView, NewContent } from '../../artifacts/artifacts.types.js';
import type { Actor } from '../../auth/auth.types.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  generateSecretToken,
  hashSecretToken,
  SECRET_TOKEN_PATTERN,
} from '../../common/tokens/secret-tokens.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { UploadSession } from './upload-session.entity.js';
import type { IssuedUploadSession } from './upload-sessions.types.js';

/**
 * An expired session is kept this long, so its upload page says "expired" rather than
 * "doesn't work", then the sweeper deletes it.
 */
export const EXPIRED_SESSION_RETENTION_HOURS = 24;

/** Said for a token that doesn't exist and for someone else's: existence isn't revealed. */
const NOT_FOUND_MESSAGE = "This upload link doesn't work. Ask your assistant for a new one.";

/**
 * Upload sessions (plan §8): how an MCP client gets a binary file (an image, a PDF) to us. It
 * asks for one; the user (upload page, session cookie) or the client itself (`PUT`, API
 * token) sends the file. Both need the token and the owner's own sign-in. Single use: the
 * session is consumed atomically, released if the upload fails, and a repeat after success
 * returns the same result.
 */
@Injectable()
export class UploadSessionsService {
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(UploadSession) private readonly sessions: Repository<UploadSession>,
    private readonly artifacts: ArtifactsService,
    @InjectPinoLogger(UploadSessionsService.name) private readonly logger: PinoLogger,
    @InjectEnv() env: Env,
  ) {
    this.ttlMs = env.UPLOAD_SESSION_TTL_MINUTES * 60_000;
  }

  /**
   * An upload for `artifactId`, which the actor must be able to edit: its first version if it
   * is a draft (`create`), otherwise its next one.
   */
  async issue(
    actor: Actor,
    artifactId: string,
    { changeNote = null }: { changeNote?: string | null } = {},
  ): Promise<IssuedUploadSession> {
    const { artifact } = await this.artifacts.getForAction(actor, artifactId, 'edit');
    const purpose: UploadSessionPurpose = artifact.status === 'draft' ? 'create' : 'new_version';
    const token = generateSecretToken();
    const session = await this.sessions.save(
      this.sessions.create({
        tokenHash: hashSecretToken(token),
        userId: actor.userId,
        artifactId: artifact.id,
        purpose,
        changeNote: changeNote || null,
        expiresAt: new Date(Date.now() + this.ttlMs),
        consumedAt: null,
        resultingVersionId: null,
      }),
    );
    this.logger.info(
      { userId: actor.userId, artifactId: artifact.id, uploadSessionId: session.id, purpose },
      'Upload session issued',
    );
    return { session, token };
  }

  /** The session behind `token`, for the upload page. Owner only. */
  async describe(actor: Actor, token: string): Promise<UploadSessionDto> {
    const session = await this.find(actor, token);
    const { artifact } = await this.artifacts.get(actor, session.artifactId);
    return {
      purpose: session.purpose,
      status: session.resultingVersionId
        ? 'done'
        : session.expiresAt.getTime() <= Date.now()
          ? 'expired'
          : 'open',
      artifact: { id: artifact.id, title: artifact.title },
      versionNo: artifact.latestVersionNo + 1,
      changeNote: session.changeNote,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Uploads `content` through the normal pipeline as the artifact's next version. Owner only.
   * A repeat after success returns the artifact without reading `content`.
   */
  async complete(actor: Actor, token: string, content: NewContent): Promise<ArtifactView> {
    const session = await this.find(actor, token);
    const log = {
      userId: actor.userId,
      artifactId: session.artifactId,
      uploadSessionId: session.id,
    };
    if (session.resultingVersionId) return this.replay(actor, session, content);

    const now = new Date();
    const { affected } = await this.sessions.update(
      { id: session.id, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { consumedAt: now },
    );
    if (!affected) {
      const current = await this.sessions.findOneByOrFail({ id: session.id });
      if (current.resultingVersionId) return this.replay(actor, current, content);
      content.stream.resume();
      if (current.expiresAt.getTime() <= now.getTime()) {
        this.logger.info(log, 'Upload session expired');
        throw new AppError(
          ErrorCode.UPLOAD_SESSION_EXPIRED,
          'This upload link has expired. Ask your assistant for a new one.',
        );
      }
      throw new AppError(
        ErrorCode.UPLOAD_SESSION_USED,
        'A file is already being uploaded with this link. Wait for it to finish.',
      );
    }

    let view: ArtifactView;
    try {
      view = await this.artifacts.addVersion(
        actor,
        session.artifactId,
        { changeNote: session.changeNote ?? '' },
        content,
      );
    } catch (error) {
      // Released, so the user can try again with the right file before it expires.
      await this.sessions.update({ id: session.id }, { consumedAt: null });
      throw error;
    }
    await this.sessions.update(
      { id: session.id },
      { resultingVersionId: view.artifact.currentVersionId },
    );
    this.logger.info({ ...log, versionNo: view.latestVersionNo }, 'Upload session consumed');
    return view;
  }

  /**
   * Maintenance, for the sweeper (no actor): deletes sessions that expired over
   * `EXPIRED_SESSION_RETENTION_HOURS` ago. Returns how many.
   */
  async deleteExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - EXPIRED_SESSION_RETENTION_HOURS * 3600_000);
    const { affected } = await this.sessions.delete({ expiresAt: LessThan(cutoff) });
    return affected ?? 0;
  }

  /** The live session for `token` if the actor owns it; `NOT_FOUND` otherwise. */
  private async find(actor: Actor, token: string): Promise<UploadSession> {
    const session = SECRET_TOKEN_PATTERN.test(token)
      ? await this.sessions.findOneBy({ tokenHash: hashSecretToken(token) })
      : null;
    if (!session || session.userId !== actor.userId) {
      this.logger.debug(
        { userId: actor.userId, reason: session ? 'not_owner' : 'unknown' },
        'Upload session refused',
      );
      throw new AppError(ErrorCode.NOT_FOUND, NOT_FOUND_MESSAGE);
    }
    return session;
  }

  /** A repeat of a finished upload: the same result, and the new content is not read. */
  private replay(actor: Actor, session: UploadSession, content: NewContent): Promise<ArtifactView> {
    content.stream.resume();
    return this.artifacts.get(actor, session.artifactId);
  }
}
