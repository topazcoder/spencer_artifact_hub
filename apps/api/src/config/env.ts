import { z } from 'zod';

const DEV_APP_BASE_URL = 'http://localhost:5173';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** Public origin of the web app; used for links (share URLs, upload URLs) and the CSRF Origin check. */
    APP_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  .transform((env, ctx) => {
    if (!env.APP_BASE_URL && env.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'Required in production' });
      return z.NEVER;
    }
    return { ...env, APP_BASE_URL: (env.APP_BASE_URL ?? DEV_APP_BASE_URL).replace(/\/+$/, '') };
  });

export type Env = z.output<typeof envSchema>;

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
