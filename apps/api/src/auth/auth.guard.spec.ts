import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@artifact-hub/shared';
import type { Request } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { AppError } from '../common/errors/app-error.js';
import { Auth, Public } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthScheme, RequestAuth, RequestAuthenticator } from './auth.types.js';

/** What a fake authenticator answers: no credentials, invalid ones, or a user. */
type Answer = 'none' | 'invalid' | { userId: string };

function authenticator(scheme: AuthScheme, answer: Answer) {
  return {
    scheme,
    missingCredentialsMessage: `No ${scheme}`,
    authenticate: vi.fn(async (): Promise<RequestAuth | null> => {
      if (answer === 'none') return null;
      if (answer === 'invalid') throw new AppError(ErrorCode.UNAUTHENTICATED, `Bad ${scheme}`);
      return scheme === 'session'
        ? { scheme, actor: { userId: answer.userId, via: 'web' }, sessionId: 's1' }
        : { scheme, actor: { userId: answer.userId, via: 'mcp' }, apiTokenId: 't1' };
    }),
  } satisfies RequestAuthenticator;
}

class Routes {
  default() {}
  @Public() open() {}
  @Auth('api_token') tokenOnly() {}
  @Auth('session', 'api_token') either() {}
}

function contextFor(handler: keyof Routes, req: Partial<Request> = {}, type = 'http') {
  return {
    getType: () => type,
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

function guardWith(...authenticators: RequestAuthenticator[]) {
  const logger = { assign: vi.fn() };
  const guard = new AuthGuard(new Reflector(), authenticators, logger as unknown as PinoLogger);
  return { guard, logger };
}

describe('AuthGuard', () => {
  it.each(['ws', 'rpc'])('fails closed for the %s transport', async (type) => {
    const { guard } = guardWith(authenticator('session', 'none'));
    await expect(guard.canActivate(contextFor('default', {}, type))).rejects.toThrow(
      /only supports HTTP/,
    );
  });

  it('lets public routes through without asking anyone', async () => {
    const session = authenticator('session', 'invalid');
    const { guard } = guardWith(session);
    await expect(guard.canActivate(contextFor('open'))).resolves.toBe(true);
    expect(session.authenticate).not.toHaveBeenCalled();
  });

  it('requires a session by default, and sets req.authentication and the log context', async () => {
    const session = authenticator('session', { userId: 'u1' });
    const token = authenticator('api_token', { userId: 'u2' });
    const { guard, logger } = guardWith(session, token);
    const req: Partial<Request> = {};

    await expect(guard.canActivate(contextFor('default', req))).resolves.toBe(true);
    expect(req.authentication).toMatchObject({
      scheme: 'session',
      actor: { userId: 'u1', via: 'web' },
    });
    expect(logger.assign).toHaveBeenCalledWith({ userId: 'u1' });
    expect(token.authenticate).not.toHaveBeenCalled();
  });

  it('asks only the authenticators the route accepts', async () => {
    const session = authenticator('session', { userId: 'u1' });
    const token = authenticator('api_token', 'none');
    const { guard } = guardWith(session, token);
    await expect(guard.canActivate(contextFor('tokenOnly'))).rejects.toThrow('No api_token');
    expect(session.authenticate).not.toHaveBeenCalled();
  });

  it('tries the accepted schemes in order until one authenticates', async () => {
    const { guard, logger } = guardWith(
      authenticator('session', 'none'),
      authenticator('api_token', { userId: 'u2' }),
    );
    const req: Partial<Request> = {};
    await expect(guard.canActivate(contextFor('either', req))).resolves.toBe(true);
    expect(req.authentication).toMatchObject({ scheme: 'api_token', actor: { via: 'mcp' } });
    expect(logger.assign).toHaveBeenCalledWith({ userId: 'u2', tokenId: 't1' });
  });

  it('rejects invalid credentials even when another scheme would accept the request', async () => {
    const token = authenticator('api_token', { userId: 'u2' });
    const { guard } = guardWith(authenticator('session', 'invalid'), token);
    await expect(guard.canActivate(contextFor('either'))).rejects.toThrow('Bad session');
    expect(token.authenticate).not.toHaveBeenCalled();
  });

  it("answers with the first scheme's message when no credentials were sent", async () => {
    const { guard } = guardWith(
      authenticator('session', 'none'),
      authenticator('api_token', 'none'),
    );
    const error = await guard.canActivate(contextFor('either')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: ErrorCode.UNAUTHENTICATED, message: 'No session' });
  });

  it('fails closed for a scheme nobody registered', async () => {
    const { guard } = guardWith(authenticator('session', { userId: 'u1' }));
    await expect(guard.canActivate(contextFor('tokenOnly'))).rejects.toThrow(
      "No authenticator registered for 'api_token'",
    );
  });

  it('refuses two authenticators for one scheme', () => {
    expect(() =>
      guardWith(authenticator('session', 'none'), authenticator('session', 'none')),
    ).toThrow(/Two authenticators/);
  });
});
