const MAX_LENGTH = 255;

/**
 * Makes a client-supplied filename safe to store and display: drops any directory part,
 * control and bidi-override characters, collapses whitespace and caps the length.
 * Returns null when nothing usable is left. Never used to build storage paths.
 */
export function sanitizeFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = filename.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return null;
  return truncateKeepingExtension(cleaned, MAX_LENGTH);
}

function truncateKeepingExtension(name: string, max: number): string {
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? Array.from(name.slice(dot)) : [];
  if (ext.length === 0 || ext.length > 16) return chars.slice(0, max).join('');
  return chars.slice(0, max - ext.length).join('') + ext.join('');
}
