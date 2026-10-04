import { z } from 'zod';
import type { Env } from './config.types.js';

// Development defaults match docker-compose.yml, so `pnpm dev` works without a .env file.
const DEV_APP_BASE_URL = 'http://localhost:5173';
const DEV_DATABASE_URL = 'postgres://artifact_hub:artifact_hub@localhost:5432/artifact_hub';
/** Relative to the API's working directory (`apps/api`), which git and Docker ignore. */
const DEV_STORAGE_LOCAL_ROOT = '.data/blobs';
/** A fixed key so links survive restarts in development and tests. Never used in production. */
const DEV_SHARE_LINK_KEY = Buffer.from('dev-only-share-link-key-32-bytes').toString('base64');

const SHARE_LINK_KEY_BYTES = 32;

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
    RATE_LIMIT_USER_SEARCH_PER_MINUTE: z.coerce.number().int().min(1).default(60),
    /** Requests per client IP to share link pages and their content, which need no sign-in. */
    RATE_LIMIT_SHARE_LINK_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    /** Requests per user authenticated with an API token (MCP, upload `PUT`). */
    RATE_LIMIT_API_TOKEN_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    /**
     * 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts share link tokens so owners
     * can copy their links again; links are looked up by hash, so a database leak alone exposes
     * none. Changing it makes existing links uncopyable (they keep working). Required in
     * production.
     */
    SHARE_LINK_KEY: z
      .string()
      .refine((key) => Buffer.from(key, 'base64').length === SHARE_LINK_KEY_BYTES, {
        message: `Must be ${SHARE_LINK_KEY_BYTES} bytes, base64-encoded`,
      })
      .optional(),
    /** Where artifact content is stored. Only `local` is implemented; s3/azure are planned. */
    STORAGE_DRIVER: z.enum(['local', 's3', 'azure']).default('local'),
    /** Root directory of the `local` driver (a mounted volume in production). */
    STORAGE_LOCAL_ROOT: z.string().optional(),
    /** How long an upload link from MCP (images, PDFs) stays usable. */
    UPLOAD_SESSION_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(30),
    /** Largest artifact version accepted, enforced while the upload streams in. 10 MB by default. */
    MAX_ARTIFACT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1024 * 1024 * 1024)
      .default(10 * 1024 * 1024),
  })
  .transform((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const key of ['APP_BASE_URL', 'DATABASE_URL', 'SHARE_LINK_KEY'] as const) {
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
      SHARE_LINK_KEY: env.SHARE_LINK_KEY ?? DEV_SHARE_LINK_KEY,
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
