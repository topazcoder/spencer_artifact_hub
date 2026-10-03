import { Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import type { Request } from 'express';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';

export const LOGIN_IP_THROTTLER = 'login-ip';
export const LOGIN_EMAIL_THROTTLER = 'login-email';
export const USER_SEARCH_THROTTLER = 'user-search';

/** Every login and signup throttler, for routes that only want the others. */
export const LOGIN_THROTTLERS = [LOGIN_IP_THROTTLER, LOGIN_EMAIL_THROTTLER] as const;

/** Counts attempts per submitted email, so spreading guesses over many IPs doesn't help. */
function emailTracker(req: Record<string, unknown>): string {
  const { body, ip } = req as unknown as Request;
  const email: unknown = body?.email;
  return typeof email === 'string' ? `email:${email.trim().toLowerCase()}` : `ip:${ip}`;
}

/** Counts per signed-in user (the session guard runs first), falling back to the IP. */
function userTracker(req: Record<string, unknown>): string {
  const { auth, ip } = req as unknown as Request;
  return auth ? `user:${auth.actor.userId}` : `ip:${ip}`;
}

/**
 * In-memory rate limits (one replica). `ThrottlerGuard` is not global: routes opt in with
 * `@UseGuards(ThrottlerGuard)`, and every throttler below applies to each of those routes
 * unless skipped with `@SkipThrottle`. Counters are kept per route.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => {
        const ttl = seconds(env.RATE_LIMIT_LOGIN_WINDOW_SECONDS);
        return {
          errorMessage: 'Too many attempts. Please wait a few minutes and try again.',
          throttlers: [
            { name: LOGIN_IP_THROTTLER, ttl, limit: env.RATE_LIMIT_LOGIN_PER_IP },
            {
              name: LOGIN_EMAIL_THROTTLER,
              ttl,
              limit: env.RATE_LIMIT_LOGIN_PER_EMAIL,
              getTracker: emailTracker,
            },
            {
              name: USER_SEARCH_THROTTLER,
              ttl: seconds(60),
              limit: env.RATE_LIMIT_USER_SEARCH_PER_MINUTE,
              getTracker: userTracker,
            },
          ],
        };
      },
    }),
  ],
})
export class RateLimitModule {}
