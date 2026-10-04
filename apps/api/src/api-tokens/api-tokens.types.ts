import type { ApiToken } from './api-token.entity.js';

export interface IssuedApiToken {
  token: ApiToken;
  /** The full token. Returned once, at creation; only its hash is stored. */
  secret: string;
}

/** Why a Bearer token was refused; logged, never shown. */
export type BearerDenialReason = 'malformed' | 'unknown' | 'revoked';

export type BearerCheck =
  { ok: true; token: ApiToken } | { ok: false; reason: BearerDenialReason; tokenId?: string };
