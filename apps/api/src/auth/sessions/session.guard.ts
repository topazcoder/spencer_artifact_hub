import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppError } from '../../common/errors/app-error.js';
import { IS_PUBLIC_KEY } from '../auth.decorators.js';
import { SessionCookieService } from './session-cookie.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Global guard: every route requires a valid session cookie unless marked `@Public()`.
 * Sets `req.auth` and adds `userId` to the request's log lines. HTTP only.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookieService,
    @InjectPinoLogger(SessionGuard.name) private readonly logger: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fail closed: a new transport (websockets, microservices) must bring its own authentication.
    if (context.getType() !== 'http') {
      throw new Error(`SessionGuard only supports HTTP, not '${context.getType()}'`);
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const token = this.cookie.read(req);
    const resolved = token ? await this.sessions.resolve(token) : null;
    if (!token || !resolved) {
      if (token) this.cookie.clear(res);
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Please log in.');
    }

    const { session, extended } = resolved;
    if (extended) this.cookie.set(res, token, session.expiresAt);
    req.auth = { actor: { userId: session.userId, via: 'web' }, sessionId: session.id };
    this.logger.assign({ userId: session.userId });
    return true;
  }
}
