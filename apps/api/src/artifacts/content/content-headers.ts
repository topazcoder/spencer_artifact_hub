import type { ArtifactMimeType } from '@artifact-hub/shared';

/**
 * CSP for every content response (plan §7, S1). `sandbox` without `allow-same-origin` gives the
 * document an opaque origin, so its scripts can't read app cookies or call the API, even when
 * the content URL is opened directly. External https resources (CDN scripts, styles, fonts,
 * images) may load so AI-generated HTML renders as intended; network APIs (fetch, XHR,
 * WebSocket), form submission, nested frames and `<base>` stay blocked, and only the app
 * itself may frame the content.
 */
export const CONTENT_SECURITY_POLICY = [
  'sandbox allow-scripts allow-popups',
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:",
  "style-src 'unsafe-inline' https: data:",
  'img-src https: data: blob:',
  'font-src https: data:',
  'media-src https: data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
].join('; ');

const TEXT_MIME_TYPES = new Set<ArtifactMimeType>(['text/html', 'text/markdown', 'image/svg+xml']);

/** `Content-Type` as served: text formats are always UTF-8 (enforced at upload). */
export function servedContentType(mimeType: ArtifactMimeType): string {
  return TEXT_MIME_TYPES.has(mimeType) ? `${mimeType}; charset=utf-8` : mimeType;
}

/** True if an `If-None-Match` header lists `etag` (or `*`); weak validators count as equal. */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .some((tag) => tag === '*' || tag === etag);
}

/** Headers sent with every content response, whatever the type. */
export const CONTENT_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  // Versions never change, but access can be revoked: the browser may keep a copy, and must
  // revalidate it (a cheap 304 through the access check) before every use.
  'Cache-Control': 'private, no-cache',
};
