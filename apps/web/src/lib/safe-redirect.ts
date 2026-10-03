const BASE = 'https://app.invalid';

/**
 * Returns `next` if it is a path inside this app, else null. Keeps login redirects from
 * sending users to another site (`//evil.test`, `https://evil.test`, `/\evil.test`).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return null;
  }
  const url = URL.canParse(next, BASE) ? new URL(next, BASE) : null;
  if (url?.origin !== BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
