import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** What `generateSecretToken` returns: 32 bytes as unpadded base64url (43 characters). */
export const SECRET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * A random 256-bit bearer secret (session, share link, …). Give it to the client once and
 * store only `hashSecretToken(token)`.
 */
export function generateSecretToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex. The tokens are random, so a fast unsalted hash is enough to look them up. */
export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
