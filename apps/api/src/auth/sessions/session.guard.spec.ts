import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PinoLogger } from 'nestjs-pino';
import type { SessionCookieService } from './session-cookie.service.js';
import { SessionGuard } from './session.guard.js';
import type { SessionsService } from './sessions.service.js';

describe('SessionGuard', () => {
  const guard = new SessionGuard(
    new Reflector(),
    {} as SessionsService,
    {} as SessionCookieService,
    {} as PinoLogger,
  );

  it.each(['ws', 'rpc'])('fails closed for the %s transport', async (type) => {
    const context = { getType: () => type } as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow(/only supports HTTP/);
  });
});
