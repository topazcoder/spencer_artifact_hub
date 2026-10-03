import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Opts a route (or controller) out of authentication. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** The authenticated `Actor`. Only valid on routes that are not `@Public()`. */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<Request>().auth?.actor;
  if (!actor) throw new Error('@CurrentActor() used on a route that is not authenticated');
  return actor;
});
