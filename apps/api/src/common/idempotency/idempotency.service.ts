import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ErrorCode,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  idempotencyKeySchema,
} from '@artifact-hub/shared';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IsNull, type Repository } from 'typeorm';
import type { Actor } from '../../auth/auth.types.js';
import { AppError } from '../errors/app-error.js';
import { IdempotencyKey } from './idempotency-key.entity.js';
import type { IdempotentOperation, IdempotentResult } from './idempotency.types.js';

/** How long a key is remembered. Older keys count as new, and the sweeper deletes them. */
export const IDEMPOTENCY_KEY_TTL_HOURS = 24;

/**
 * `Idempotency-Key` for create requests from the web app (plan §10): a retry of a request that
 * succeeded answers as the first did, without doing it again. Keys are per user. Only success
 * is remembered: a failed request leaves nothing behind, so its key can be used again.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey) private readonly keys: Repository<IdempotencyKey>,
    @InjectPinoLogger(IdempotencyService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Runs `operation` once per `Idempotency-Key` on `req`, or simply runs it if there is none.
   * A repeat gets `operation.replay`, with an `Idempotent-Replayed` header. `CONFLICT` if the
   * key was used for another request, or its first request hasn't finished yet.
   */
  async run<T>(req: Request, actor: Actor, operation: IdempotentOperation<T>): Promise<T> {
    const key = this.keyOf(req);
    if (key === null) return (await operation.execute()).result;

    const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
    const log = { userId: actor.userId, route };
    const existing = await this.claim(actor.userId, key, route);
    if (existing) {
      if (existing.route !== route) {
        throw this.reused(log);
      }
      if (existing.resourceId === null) {
        this.logger.info(log, 'Idempotent request refused: the first is still in progress');
        throw new AppError(
          ErrorCode.CONFLICT,
          'This request is still being processed. Wait a moment, then refresh the page.',
        );
      }
      if (operation.fingerprint !== existing.requestHash) throw this.reused(log);
      await operation.skip?.();
      this.logger.info({ ...log, resourceId: existing.resourceId }, 'Idempotent request replayed');
      req.res?.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
      return operation.replay(existing.resourceId);
    }

    let outcome: IdempotentResult<T>;
    try {
      outcome = await operation.execute();
    } catch (error) {
      // Nothing was done, so a retry with this key may try again.
      await this.keys.delete({ userId: actor.userId, key, resourceId: IsNull() }).catch((err) => {
        this.logger.warn({ ...log, err }, 'Could not release the Idempotency-Key of a failure');
      });
      throw error;
    }
    try {
      await this.keys.update(
        { userId: actor.userId, key },
        { requestHash: operation.fingerprint, resourceId: outcome.resourceId },
      );
    } catch (err) {
      // The work is done: answer anyway. A retry is refused as in progress, never repeated.
      this.logger.warn({ ...log, err }, 'Could not record the result of an idempotent request');
    }
    return outcome.result;
  }

  /** The key on the request, or null if there is none. `VALIDATION_FAILED` unless a UUID. */
  private keyOf(req: Request): string | null {
    const header = req.get(IDEMPOTENCY_KEY_HEADER);
    if (header === undefined) return null;
    const parsed = idempotencyKeySchema.safeParse(header.trim());
    if (!parsed.success) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, `${IDEMPOTENCY_KEY_HEADER} must be a UUID.`);
    }
    return parsed.data.toLowerCase();
  }

  /**
   * Records the key for `route`, unless it is already in use: then returns what it is used
   * for. A key older than the TTL is taken over, in the same statement.
   */
  private async claim(userId: string, key: string, route: string): Promise<IdempotencyKey | null> {
    // Twice: the key may be released by a failing first request between the two queries.
    for (let attempt = 0; attempt < 2; attempt++) {
      const claimed: unknown[] = await this.keys.query(
        `INSERT INTO idempotency_keys (user_id, key, route) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE
           SET route = EXCLUDED.route, request_hash = NULL, resource_id = NULL, created_at = now()
           WHERE idempotency_keys.created_at < now() - make_interval(hours => $4)
         RETURNING key`,
        [userId, key, route, IDEMPOTENCY_KEY_TTL_HOURS],
      );
      if (claimed.length > 0) return null;
      const existing = await this.keys.findOneBy({ userId, key });
      if (existing) return existing;
    }
    throw new AppError(ErrorCode.CONFLICT, 'This request is being retried too quickly. Try again.');
  }

  private reused(log: Record<string, string>): AppError {
    this.logger.info(log, 'Idempotent request refused: the key was used for another request');
    return new AppError(
      ErrorCode.CONFLICT,
      `This ${IDEMPOTENCY_KEY_HEADER} was already used for a different request.`,
    );
  }
}
