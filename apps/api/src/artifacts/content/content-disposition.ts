import path from 'node:path';
import type { ArtifactMimeType } from '@artifact-hub/shared';
import { sanitizeFilename } from '../../uploads/content/sanitize-filename.js';

const EXTENSIONS: Record<ArtifactMimeType, string[]> = {
  'text/html': ['.html', '.htm'],
  'image/svg+xml': ['.svg'],
  'text/markdown': ['.md', '.markdown'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'application/pdf': ['.pdf'],
};

const KNOWN_EXTENSIONS = new Set(Object.values(EXTENSIONS).flat());

/**
 * The name a download is saved as: the original filename, else the title, always ending in an
 * extension that matches the real type (so a `.html` upload sniffed as PNG saves as `.png`).
 */
export function downloadFilename(
  originalFilename: string | null,
  title: string,
  mimeType: ArtifactMimeType,
): string {
  const name =
    sanitizeFilename(originalFilename) ??
    // A title is not a path: keep "Q3 / roadmap" whole instead of dropping "Q3 /".
    sanitizeFilename(title.replace(/[/\\]/g, '-')) ??
    'artifact';
  const extensions = EXTENSIONS[mimeType];
  const current = path.extname(name).toLowerCase();
  if (extensions.includes(current)) return name;
  // Replace the extension of another artifact type; keep anything else ("report.v2" → ".v2.pdf").
  const base = KNOWN_EXTENSIONS.has(current) ? name.slice(0, -current.length) : name;
  return `${base}${extensions[0]}`;
}

/**
 * `Content-Disposition: attachment` per RFC 6266: an ASCII-only `filename` for old clients and
 * the exact name, percent-encoded, in `filename*`.
 */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
