import { z } from 'zod';

export const API_TOKEN_NAME_MAX_LENGTH = 80;
/** Live (not revoked) tokens a user may have at once. */
export const API_TOKENS_MAX = 20;
/** Every API token starts with this, so it is recognizable (and findable by secret scanners). */
export const API_TOKEN_PREFIX = 'ah_';

/** An API token as its owner sees it in the list: never the secret, only its first characters. */
export const apiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The first characters of the token (e.g. `ah_x7Kq2`), to tell tokens apart. */
  prefix: z.string(),
  /** Null until the token is first used. Updated at most every few minutes. */
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type ApiToken = z.infer<typeof apiTokenSchema>;

/** Response of `GET /api/tokens`: live tokens, newest first. */
export const apiTokenListResponseSchema = z.object({ items: z.array(apiTokenSchema) });

export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;

/** Body of `POST /api/tokens`. */
export const createApiTokenRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the token a name.')
    .max(API_TOKEN_NAME_MAX_LENGTH, `Use at most ${API_TOKEN_NAME_MAX_LENGTH} characters.`),
});

export type CreateApiTokenRequest = z.infer<typeof createApiTokenRequestSchema>;

/** Response of `POST /api/tokens`. `secret` is the full token, shown this once only. */
export const createApiTokenResponseSchema = z.object({
  token: apiTokenSchema,
  secret: z.string().startsWith(API_TOKEN_PREFIX),
});

export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
