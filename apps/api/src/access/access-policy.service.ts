import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import type { AccessAction, AccessTarget, DenialReason } from './access.types.js';

export const ARTIFACT_NOT_FOUND_MESSAGE = 'Artifact not found.';

/**
 * The only place that decides who may do what with an artifact (plan §4). REST and MCP both go
 * through it. Owner-only for now; public visibility and shares extend it in steps 12–14.
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
      .andWhere(`${alias}.ownerId = :accessViewerId`, { accessViewerId: actor.userId });
  }

  private denialReason(
    actor: Actor,
    _action: AccessAction,
    artifact: AccessTarget,
  ): DenialReason | null {
    if (artifact.deletedAt) return 'deleted';
    if (artifact.ownerId !== actor.userId) return 'not_owner';
    return null;
  }
}
