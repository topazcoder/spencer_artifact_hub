import { Injectable } from '@nestjs/common';
import { type ArtifactPermissions, ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import type {
  AccessAction,
  AccessTarget,
  DenialReason,
  LinkDenialReason,
  LinkTarget,
} from './access.types.js';

export const ARTIFACT_NOT_FOUND_MESSAGE = 'Artifact not found.';

/** Actions only the owner may take, whatever else grants access. */
const OWNER_ONLY_ACTIONS: ReadonlySet<AccessAction> = new Set(['edit', 'share', 'delete']);

/**
 * The only place that decides who may do what with an artifact (plan §4). REST and MCP both go
 * through it.
 *
 * - The owner may do everything, drafts included.
 * - Everyone at the company may view and comment on a published `public` artifact.
 * - A share lets its user view a published artifact, and comment if its permission is
 *   `comment`.
 * - Company access and each share show the latest version or one pinned version.
 * - Nobody else gets anything. Deleted artifacts are gone for everyone.
 *
 * A share link lets anyone who has it view and download one version, without signing in, while
 * it is live (`linkDenialReason`). It is checked by the link's own endpoints only, and never
 * grants anything inside the app.
 */
@Injectable()
export class AccessPolicyService {
  constructor(@InjectPinoLogger(AccessPolicyService.name) private readonly logger: PinoLogger) {}

  can(actor: Actor, action: AccessAction, artifact: AccessTarget): boolean {
    return this.denialReason(actor, action, artifact) === null;
  }

  /** Everything beyond viewing that `actor` may do, for clients to show the right actions. */
  permissions(actor: Actor, artifact: AccessTarget): ArtifactPermissions {
    return {
      comment: this.can(actor, 'comment', artifact),
      edit: this.can(actor, 'edit', artifact),
      share: this.can(actor, 'share', artifact),
      delete: this.can(actor, 'delete', artifact),
    };
  }

  /**
   * Throws unless `actor` may perform `action`. Callers who may not even view the artifact get
   * `NOT_FOUND`, exactly as if it did not exist; those who may view it but not do more get
   * `FORBIDDEN`.
   */
  assertCan(actor: Actor, action: AccessAction, artifact: AccessTarget): void {
    const reason = this.denialReason(actor, action, artifact);
    if (reason === null) return;

    this.logger.debug(
      { userId: actor.userId, artifactId: artifact.id, action, reason },
      'Access denied',
    );
    if (action !== 'view' && this.can(actor, 'view', artifact)) {
      throw new AppError(ErrorCode.FORBIDDEN, "You don't have permission to do that.");
    }
    throw new AppError(ErrorCode.NOT_FOUND, ARTIFACT_NOT_FOUND_MESSAGE);
  }

  /**
   * The versions `actor` may see, by id: `null` for all of them, or the pinned versions of
   * the access they have, when all of it is pinned. Empty when they may not view the artifact.
   */
  visibleVersionIds(actor: Actor, artifact: AccessTarget): ReadonlySet<string> | null {
    if (!this.can(actor, 'view', artifact)) return new Set();
    if (artifact.ownerId === actor.userId) return null;
    const pinned = new Set<string>();
    const shown = [
      ...(artifact.visibility === 'public' ? [artifact.publicPinnedVersionId] : []),
      ...artifact.grants.map((grant) => grant.pinnedVersionId),
    ];
    for (const versionId of shown) {
      if (versionId === null) return null;
      pinned.add(versionId);
    }
    return pinned;
  }

  /** Why `link` no longer opens its artifact, or null while it does. */
  linkDenialReason(link: LinkTarget, now: Date = new Date()): LinkDenialReason | null {
    if (link.artifact.deletedAt || link.artifact.status !== 'published') return 'artifact_gone';
    if (link.revokedAt) return 'revoked';
    if (link.expiresAt && link.expiresAt <= now) return 'expired';
    return null;
  }

  /**
   * Narrows a query on artifacts (selected as `alias`) to those `actor` may view: the SQL form
   * of `can(actor, 'view', …)`, for lists. Keep the two in step.
   */
  restrictToViewable<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    actor: Actor,
  ): SelectQueryBuilder<T> {
    return qb.andWhere(`${alias}.deletedAt IS NULL`).andWhere(
      new Brackets((visible) =>
        visible
          .where(`${alias}.ownerId = :accessViewerId`, { accessViewerId: actor.userId })
          .orWhere(`(${alias}.visibility = 'public' AND ${alias}.status = 'published')`)
          .orWhere(
            `(${alias}.status = 'published' AND EXISTS (
              SELECT 1 FROM shares share
              WHERE share.artifact_id = ${alias}.id AND share.user_id = :accessViewerId
            ))`,
          ),
      ),
    );
  }

  private denialReason(
    actor: Actor,
    action: AccessAction,
    artifact: AccessTarget,
  ): DenialReason | null {
    if (artifact.deletedAt) return 'deleted';
    if (artifact.ownerId === actor.userId) return null;
    if (artifact.status !== 'published') return 'draft';
    if (artifact.visibility !== 'public' && artifact.grants.length === 0) return 'private';
    if (OWNER_ONLY_ACTIONS.has(action)) return 'owner_only';
    if (
      action === 'comment' &&
      artifact.visibility !== 'public' &&
      !artifact.grants.some((grant) => grant.permission === 'comment')
    ) {
      return 'view_only';
    }
    return null;
  }
}
