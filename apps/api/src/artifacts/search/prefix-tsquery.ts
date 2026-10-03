/** More words than this are ignored; they rarely narrow a search further. */
const MAX_TERMS = 8;

/**
 * Turns what a user typed into a `to_tsquery` expression where every word must match, as a
 * whole word or the start of one ("pric pag" finds "Pricing page"), so results show up while
 * typing. Only letters and digits survive, so the result is always valid tsquery syntax.
 * Returns null when nothing searchable is left.
 */
export function prefixTsquery(text: string): string | null {
  const terms = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((term) => `${term}:*`).join(' & ');
}
