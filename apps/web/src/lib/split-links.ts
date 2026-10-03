/** A run of plain text, or a web link found in it. */
export type TextPart =
  { type: 'text'; text: string } | { type: 'link'; text: string; href: string };

/** `http(s)://` up to the next space; never other schemes, so `javascript:` stays text. */
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/gi;
/** Punctuation that usually ends the sentence rather than the URL. */
const TRAILING_PUNCTUATION = new Set('.,;:!?\'")]}');
const OPENING_BRACKET: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/**
 * Splits user-written text into plain text and `http(s)` links, for rendering links in
 * comments without ever rendering the text as HTML. Unbalanced closing brackets and trailing
 * punctuation are left out of a link (`(see https://x.io/a).` links `https://x.io/a`).
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = trimUrl(match[0]);
    const start = match.index;
    if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) });
    parts.push({ type: 'link', text: href, href });
    cursor = start + href.length;
  }
  if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
  return parts;
}

/** Drops trailing punctuation, but keeps a closing bracket that closes one in the URL. */
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1] ?? '';
    if (!TRAILING_PUNCTUATION.has(char)) break;
    const open = OPENING_BRACKET[char];
    if (open && count(url, open, end) >= count(url, char, end)) break;
    end--;
  }
  return url.slice(0, end);
}

function count(text: string, char: string, end: number): number {
  return text.slice(0, end).split(char).length - 1;
}
