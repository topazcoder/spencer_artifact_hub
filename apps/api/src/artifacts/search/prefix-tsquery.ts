import type { SearchMatch } from './search.types.js';

/** More words than this are ignored; they rarely narrow a search further. */
const MAX_TERMS = 8;
/** More alternatives per word than this are ignored. */
const MAX_ALTERNATIVES = 5;

/** A word, or words joined by `|` with no space between: alternatives for one word. */
const GROUP = /[\p{L}\p{N}]+(?:\|[\p{L}\p{N}]+)*/gu;

const prefixed = (terms: string[]) => terms.map((term) => `${term}:*`);

/**
 * Turns what a user typed into a `to_tsquery` expression, where each word may be a whole word
 * or the start of one ("pric pag" finds "Pricing page"), so results show up while typing.
 *
 * `a|b` (no spaces) lists alternatives for one word, as the AI search writes synonyms:
 * "pricing|price deck" finds "deck" with "pricing" or "price". With `match: 'all'` (the
 * default) every word must match; with `'any'`, one is enough, for when "all" found nothing.
 *
 * Only letters and digits survive, so the result is always valid tsquery syntax. Returns null
 * when nothing searchable is left.
 */
export function prefixTsquery(text: string, match: SearchMatch = 'all'): string | null {
  const groups = (text.toLowerCase().match(GROUP) ?? [])
    .slice(0, MAX_TERMS)
    .map((group) => group.split('|').slice(0, MAX_ALTERNATIVES));
  if (groups.length === 0) return null;
  if (match === 'any') return groups.flatMap(prefixed).join(' | ');
  return groups
    .map((terms) => (terms.length > 1 ? `(${prefixed(terms).join(' | ')})` : `${terms[0]}:*`))
    .join(' & ');
}
