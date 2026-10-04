import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppError } from '../common/errors/app-error.js';
import { AUTH_SCHEMES_KEY, IS_PUBLIC_KEY } from './auth.decorators.js';
import type { AuthScheme, RequestAuthenticator } from './auth.types.js';

/** Every registered `RequestAuthenticator` (see `AuthModule.register`). */
export const REQUEST_AUTHENTICATORS = Symbol('REQUEST_AUTHENTICATORS');

const DEFAULT_SCHEMES: AuthScheme[] = ['session'];

/**
 * Global guard: every route requires credentials unless marked `@Public()`. A session by
 * default; `@Auth(...)` names others. Sets `req.authentication` and adds the user to the request's log
 * lines. Fails closed: other transports, and schemes nobody registered, are errors.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly authenticators: Map<AuthScheme, RequestAuthenticator>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(REQUEST_AUTHENTICATORS) authenticators: RequestAuthenticator[],
    @InjectPinoLogger(AuthGuard.name) private readonly logger: PinoLogger,
  ) {
    this.authenticators = new Map();
    for (const authenticator of authenticators) {
      if (this.authenticators.has(authenticator.scheme)) {
        throw new Error(`Two authenticators for the '${authenticator.scheme}' scheme`);
      }
      this.authenticators.set(authenticator.scheme, authenticator);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A new transport (websockets, microservices) must bring its own authentication.
    if (context.getType() !== 'http') {
      throw new Error(`AuthGuard only supports HTTP, not '${context.getType()}'`);
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;
    const schemes =
      this.reflector.getAllAndOverride<AuthScheme[] | undefined>(AUTH_SCHEMES_KEY, targets) ??
      DEFAULT_SCHEMES;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const accepted = schemes.map((scheme) => {
      const authenticator = this.authenticators.get(scheme);
      if (!authenticator) throw new Error(`No authenticator registered for '${scheme}'`);
      return authenticator;
    });
    for (const authenticator of accepted) {
      const auth = await authenticator.authenticate(req, res);
      if (!auth) continue;
      req.authentication = auth;
      this.logger.assign({
        userId: auth.actor.userId,
        ...(auth.scheme === 'api_token' ? { tokenId: auth.apiTokenId } : {}),
      });
      return true;
    }
    throw new AppError(ErrorCode.UNAUTHENTICATED, accepted[0]!.missingCredentialsMessage);
  }
}
