import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import { API_TOKEN_THROTTLER, UseThrottlers } from '../common/rate-limit/rate-limit.module.js';
import type { Actor, AuthScheme } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const AUTH_SCHEMES_KEY = 'auth:schemes';

/** Opts a route (or controller) out of authentication. Everything else requires a session. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * The credentials a route (or controller) accepts, tried in this order, instead of a session
 * only. Routes accepting an API token are rate limited per user; they can't add other throttlers
 * with `@UseThrottlers()`, which would skip this one.
 */
export const Auth = (...schemes: [AuthScheme, ...AuthScheme[]]) =>
  schemes.includes('api_token')
    ? applyDecorators(SetMetadata(AUTH_SCHEMES_KEY, schemes), UseThrottlers(API_TOKEN_THROTTLER))
    : SetMetadata(AUTH_SCHEMES_KEY, schemes);

/** The authenticated `Actor`. Only valid on routes that are not `@Public()`. */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<Request>().auth?.actor;
  if (!actor) throw new Error('@CurrentActor() used on a route that is not authenticated');
  return actor;
});
