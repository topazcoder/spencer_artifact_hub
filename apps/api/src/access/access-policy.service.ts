import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Brackets, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import type { AccessAction, AccessTarget, DenialReason } from './access.types.js';

export const ARTIFACT_NOT_FOUND_MESSAGE = 'Artifact not found.';

/** Actions only the owner may take, whatever else grants access. */
const OWNER_ONLY_ACTIONS: ReadonlySet<AccessAction> = new Set(['edit', 'share', 'delete']);

/**
 * The only place that decides who may do what with an artifact (plan §4). REST and MCP both go
 * through it.
 *
 * - The owner may do everything, drafts included.
 * - Anyone may view and comment on a published `public` artifact.
 * - Nobody else gets anything (shares extend this in steps 13–14). Deleted artifacts are gone
 *   for everyone.
 */
@Injectable()
export class AccessPolicyService {
  constructor(@InjectPinoLogger(AccessPolicyService.name) private readonly logger: PinoLogger) {}

  can(actor: Actor, action: AccessAction, artifact: AccessTarget): boolean {
    return this.denialReason(actor, action, artifact) === null;
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
   * Narrows a query on artifacts (selected as `alias`) to those `actor` may view: the SQL form
   * of `can(actor, 'view', …)`, for lists. Keep the two in step.
   */
  restrictToViewable<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    actor: Actor,
  ): SelectQueryBuilder<T> {
    return qb
      .andWhere(`${alias}.deletedAt IS NULL`)
      .andWhere(
        new Brackets((visible) =>
          visible
            .where(`${alias}.ownerId = :accessViewerId`, { accessViewerId: actor.userId })
            .orWhere(`(${alias}.visibility = 'public' AND ${alias}.status = 'published')`),
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
    if (artifact.visibility !== 'public') return 'private';
    if (OWNER_ONLY_ACTIONS.has(action)) return 'owner_only';
    return null;
  }
}
