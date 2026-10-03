import { z } from 'zod';
import type { Env } from './config.types.js';

// Development defaults match docker-compose.yml, so `pnpm dev` works without a .env file.
const DEV_APP_BASE_URL = 'http://localhost:5173';
const DEV_DATABASE_URL = 'postgres://artifact_hub:artifact_hub@localhost:5432/artifact_hub';
/** Relative to the API's working directory (`apps/api`), which git and Docker ignore. */
const DEV_STORAGE_LOCAL_ROOT = '.data/blobs';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** Public origin of the web app; used for links (share URLs, upload URLs) and the CSRF Origin check. */
    APP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    /** Directory of the built SPA. When set, the API also serves the web app (production image). */
    WEB_DIST_DIR: z.string().optional(),
    /**
     * Number of reverse proxies in front of the app (1 on Railway). Needed so the client IP used
     * for rate limiting and session records is the real one, not the proxy's.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    /** Defaults to true in production and false otherwise (plain-http dev server). */
    COOKIE_SECURE: z.stringbool().optional(),
    /** Login attempts allowed per window, counted per client IP and per email. */
    RATE_LIMIT_LOGIN_PER_IP: z.coerce.number().int().min(1).default(20),
    RATE_LIMIT_LOGIN_PER_EMAIL: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
    /** Where artifact content is stored. Only `local` is implemented; s3/azure are planned. */
    STORAGE_DRIVER: z.enum(['local', 's3', 'azure']).default('local'),
    /** Root directory of the `local` driver (a mounted volume in production). */
    STORAGE_LOCAL_ROOT: z.string().optional(),
  })
  .transform((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const key of ['APP_BASE_URL', 'DATABASE_URL'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required in production' });
      }
      // Never fall back to a directory inside the container, which is lost on redeploy.
      if (env.STORAGE_DRIVER === 'local' && !env.STORAGE_LOCAL_ROOT) {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_LOCAL_ROOT'],
          message: 'Required in production when STORAGE_DRIVER=local',
        });
      }
      if (ctx.issues.length > 0) return z.NEVER;
    }
    return {
      ...env,
      APP_BASE_URL: (env.APP_BASE_URL ?? DEV_APP_BASE_URL).replace(/\/+$/, ''),
      DATABASE_URL: env.DATABASE_URL ?? DEV_DATABASE_URL,
      COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
      STORAGE_LOCAL_ROOT: env.STORAGE_LOCAL_ROOT ?? DEV_STORAGE_LOCAL_ROOT,
    };
  });

export class InvalidEnvError extends Error {
  constructor(error: z.ZodError) {
    super(`Invalid environment configuration:\n${z.prettifyError(error)}`);
    this.name = 'InvalidEnvError';
  }
}

/** Parses and validates environment variables. Throws `InvalidEnvError` listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as unset so `FOO=` in a .env file falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) throw new InvalidEnvError(result.error);
  return result.data;
}
