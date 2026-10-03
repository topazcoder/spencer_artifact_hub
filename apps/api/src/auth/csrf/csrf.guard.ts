import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppError } from '../../common/errors/app-error.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import type { CsrfDecision } from './csrf.types.js';
import { SessionCookieService } from '../sessions/session-cookie.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Decides whether a request may change state. Browsers send `Origin` on every cross-site
 * (and same-site) non-GET request, so a foreign or `null` origin is rejected. When neither
 * `Origin` nor `Referer` is present, only requests that carry no session cookie are let
 * through (non-browser clients such as curl signing up).
 */
export function checkRequestOrigin(
  input: { method: string; origin?: string; referer?: string; hasSessionCookie: boolean },
  allowedOrigin: string,
): CsrfDecision {
  if (SAFE_METHODS.has(input.method)) return 'allow';
  let source = input.origin;
  if (source === undefined && input.referer !== undefined) {
    source = URL.canParse(input.referer) ? new URL(input.referer).origin : 'invalid';
  }
  if (source === undefined) return input.hasSessionCookie ? 'missing_origin' : 'allow';
  return source === allowedOrigin ? 'allow' : 'foreign_origin';
}

/** Global guard rejecting cross-site state-changing requests (CSRF), on top of `SameSite=Lax`. */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    @InjectEnv() env: Env,
    private readonly cookie: SessionCookieService,
    @InjectPinoLogger(CsrfGuard.name) private readonly logger: PinoLogger,
  ) {
    this.allowedOrigin = new URL(env.APP_BASE_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const decision = checkRequestOrigin(
      {
        method: req.method,
        origin: req.get('origin'),
        referer: req.get('referer'),
        hasSessionCookie: this.cookie.read(req) !== undefined,
      },
      this.allowedOrigin,
    );
    if (decision === 'allow') return true;

    this.logger.warn(
      { reason: decision, origin: req.get('origin'), method: req.method, path: req.path },
      'Cross-site request blocked',
    );
    throw new AppError(ErrorCode.FORBIDDEN, 'Cross-site request blocked.');
  }
}
