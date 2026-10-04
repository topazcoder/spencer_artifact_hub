import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { API_TOKEN_PREFIX, API_TOKENS_MAX, ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { IsNull, LessThan, Or, type Repository } from 'typeorm';
import { z } from 'zod';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import {
  generateSecretToken,
  hashSecretToken,
  SECRET_TOKEN_PATTERN,
} from '../common/tokens/secret-tokens.js';
import { ApiToken } from './api-token.entity.js';
import type { BearerCheck, IssuedApiToken } from './api-tokens.types.js';

const idSchema = z.guid();
/** Characters of the secret shown after `ah_` in the list. */
const DISPLAY_PREFIX_LENGTH = 5;
/** Record use at most this often, so an active client doesn't cause a write per request. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

/**
 * Personal API tokens (plan §8, S13): created and revoked by their owner in the web app, sent
 * by MCP clients and scripts as `Authorization: Bearer`. Only the SHA-256 is stored.
 */
@Injectable()
export class ApiTokensService {
  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @InjectPinoLogger(ApiTokensService.name) private readonly logger: PinoLogger,
  ) {}

  /** The actor's live tokens, newest first. */
  async list(actor: Actor): Promise<ApiToken[]> {
    return this.tokens.find({
      where: { userId: actor.userId, revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async create(actor: Actor, name: string): Promise<IssuedApiToken> {
    const live = await this.tokens.countBy({ userId: actor.userId, revokedAt: IsNull() });
    if (live >= API_TOKENS_MAX) {
      throw new AppError(
        ErrorCode.CONFLICT,
        `You can have at most ${API_TOKENS_MAX} API tokens. Revoke one you no longer use.`,
      );
    }
    const secret = `${API_TOKEN_PREFIX}${generateSecretToken()}`;
    const token = await this.tokens.save(
      this.tokens.create({
        userId: actor.userId,
        name,
        tokenPrefix: secret.slice(0, API_TOKEN_PREFIX.length + DISPLAY_PREFIX_LENGTH),
        tokenHash: hashSecretToken(secret),
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    this.logger.info({ userId: actor.userId, tokenId: token.id }, 'API token created');
    return { token, secret };
  }

  /** Stops the token working at once. Revoking a revoked token does nothing. Owner only. */
  async revoke(actor: Actor, tokenId: string): Promise<void> {
    const token = idSchema.safeParse(tokenId).success
      ? await this.tokens.findOneBy({ id: tokenId, userId: actor.userId })
      : null;
    if (!token) throw new AppError(ErrorCode.NOT_FOUND, 'API token not found.');
    if (token.revokedAt) return;
    await this.tokens.update({ id: token.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    this.logger.info({ userId: actor.userId, tokenId: token.id }, 'API token revoked');
  }

  /** Checks a Bearer token and records that it was used. */
  async check(secret: string): Promise<BearerCheck> {
    const random = secret.startsWith(API_TOKEN_PREFIX) ? secret.slice(API_TOKEN_PREFIX.length) : '';
    if (!SECRET_TOKEN_PATTERN.test(random)) return { ok: false, reason: 'malformed' };
    const token = await this.tokens.findOneBy({ tokenHash: hashSecretToken(secret) });
    if (!token) return { ok: false, reason: 'unknown' };
    if (token.revokedAt) return { ok: false, reason: 'revoked', tokenId: token.id };

    const now = new Date();
    if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.tokens.update(
        {
          id: token.id,
          lastUsedAt: Or(IsNull(), LessThan(new Date(now.getTime() - TOUCH_INTERVAL_MS))),
        },
        { lastUsedAt: now },
      );
      token.lastUsedAt = now;
    }
    return { ok: true, token };
  }
}
