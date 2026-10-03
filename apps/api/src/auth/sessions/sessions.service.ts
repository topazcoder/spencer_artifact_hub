import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, type Repository } from 'typeorm';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import type { ClientInfo, IssuedSession, ResolvedSession } from './sessions.types.js';
import { Session } from './session.entity.js';

const TOKEN_BYTES = 32;
const USER_AGENT_MAX_LENGTH = 512;
/** Extend a session at most this often, so active users don't cause a write per request. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Server-side sessions. The browser holds a random token; the database holds its hash. */
@Injectable()
export class SessionsService {
  private readonly ttlMs: number;

  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectEnv() env: Env,
  ) {
    this.ttlMs = env.SESSION_TTL_DAYS * 24 * 60 * 60_000;
  }

  async create(userId: string, client: ClientInfo): Promise<IssuedSession> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    await this.sessions.insert({
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
      lastSeenAt: now,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
    });
    return { token, expiresAt };
  }

  /** Finds the live session for a token and slides its expiry forward. */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const now = new Date();
    const session = await this.sessions.findOne({
      where: { tokenHash: hashSessionToken(token), expiresAt: MoreThan(now) },
      relations: { user: true },
    });
    if (!session) return null;

    if (now.getTime() - session.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) {
      return { session, extended: false };
    }
    session.lastSeenAt = now;
    session.expiresAt = new Date(now.getTime() + this.ttlMs);
    await this.sessions.update(session.id, {
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
    });
    return { session, extended: true };
  }

  async revoke(token: string): Promise<void> {
    await this.sessions.delete({ tokenHash: hashSessionToken(token) });
  }
}
