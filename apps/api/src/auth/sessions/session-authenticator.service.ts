import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import type { RequestAuth, RequestAuthenticator } from '../auth.types.js';
import { SessionCookieService } from './session-cookie.service.js';
import { SessionsService } from './sessions.service.js';

const LOG_IN_MESSAGE = 'Please log in.';

/** The session cookie of the web app. Re-sends the cookie when the session was extended. */
@Injectable()
export class SessionAuthenticatorService implements RequestAuthenticator {
  readonly scheme = 'session';
  readonly missingCredentialsMessage = LOG_IN_MESSAGE;

  constructor(
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookieService,
  ) {}

  async authenticate(req: Request, res: Response): Promise<RequestAuth | null> {
    const token = this.cookie.read(req);
    if (!token) return null;
    const resolved = await this.sessions.resolve(token);
    if (!resolved) {
      this.cookie.clear(res);
      throw new AppError(ErrorCode.UNAUTHENTICATED, LOG_IN_MESSAGE);
    }
    const { session, extended } = resolved;
    if (extended) this.cookie.set(res, token, session.expiresAt);
    return {
      scheme: 'session',
      actor: { userId: session.userId, via: 'web' },
      sessionId: session.id,
    };
  }
}
