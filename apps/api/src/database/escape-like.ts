/**
 * Escapes `%`, `_` and `\` so `text` matches only itself inside a LIKE / ILIKE pattern
 * (Postgres' default escape character is the backslash).
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
