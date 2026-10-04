import {
  ARTIFACT_LIST_SCOPES,
  ARTIFACT_OWNER_FILTER_MAX_LENGTH,
  ARTIFACT_OWNERS_FILTER_MAX,
  ARTIFACT_SEARCH_MAX_LENGTH,
  ARTIFACT_TYPE_FILTERS,
  type ArtifactTypeFilter,
  type SearchFilters,
} from '@artifact-hub/shared';
import { z } from 'zod';
import { UNTRUSTED_CONTENT_RULE, untrustedBlock } from '../ai/untrusted-content.js';
import type { SearchAnswer, SearchContext } from './search.types.js';

const TYPES = Object.keys(ARTIFACT_TYPE_FILTERS) as [ArtifactTypeFilter, ...ArtifactTypeFilter[]];

/**
 * What the model answers. Loose on purpose (no lengths or formats): structured output keeps the
 * shape, and `toSearchFilters` checks the values, dropping what doesn't fit.
 */
export const searchAnswerSchema = z.object({
  keywords: z
    .string()
    .nullable()
    .describe('1 to 3 distinctive words to find, each with synonyms joined by |, or null.'),
  scope: z.enum(ARTIFACT_LIST_SCOPES).nullable(),
  type: z.enum(TYPES).nullable(),
  owners: z
    .array(z.string())
    .describe('The people who published it, as listed in the owners if there; empty for none.'),
  updatedFrom: z.string().nullable().describe('YYYY-MM-DD, or null.'),
  updatedTo: z.string().nullable().describe('YYYY-MM-DD, or null.'),
});

export const SEARCH_SYSTEM_PROMPT = `You turn a search typed in Artifact Hub's gallery into filters. Artifact Hub is where a company's team publishes AI-generated artifacts (HTML pages, images, PDFs, Markdown, SVG) to browse, review and share.

Fill a field only when the search asks for it; otherwise null (an empty list for owners).
- keywords: 1 to 3 distinctive words to find in titles, descriptions and content. Every word must match, so leave out filler words, and anything that goes in another field (people, dates, kinds of file). Topics and labels go here too: artifact tags are searched as words. Follow each word with up to 3 close synonyms or other forms joined by | and no spaces, since an artifact may use another word for the same thing: any one of them matches. "the pricing deck Sara shared last week" → "pricing|price|rates". "churn dashboard" → "churn|attrition dashboard|report".
- scope: where to look. "mine": published by the user. "shared": shared with the user by name. "public": shared with everyone at the company. Null keeps the current tab, except when the search asks for someone else's artifacts while the current tab is "mine": then "shared", or "public" if it mentions the company or the team.
- type: when the search names a kind of file. html: web pages, mockups, prototypes. image: screenshots, photos, PNG, JPEG. pdf: PDF files. markdown: docs, notes, READMEs. svg: diagrams, icons, vector graphics.
- owners: the people who published it, when the search names them. Several people can share a name, and every one of them is searched, so give a name once ("Sara Lee" or just "Sara") rather than picking one. When a name is in the owners list, write it as listed, without the email. Write an email only when the search gives one, or to single out one of several people with the same name. Empty when it is the user ("my", "I"): use scope "mine" instead.
- updatedFrom, updatedTo: the days it was last updated, inclusive, as YYYY-MM-DD. Work them out from today's date for "yesterday", "last week", "in September" and the like.

${UNTRUSTED_CONTENT_RULE}`;

/** The task's input: the search, and what it is read against. */
export function searchPrompt({ text, scope, owners, today }: SearchContext): string {
  return [
    `Today is ${today} (UTC). The current tab is "${scope}".`,
    `Owners (people whose artifacts the user can see):\n${untrustedBlock('owners', owners.map(({ displayName, email }) => `${displayName} <${email}>`).join('\n') || '(none)')}`,
    `The search:\n${untrustedBlock('search', text)}`,
  ].join('\n\n');
}

const dateSchema = z.iso.date();

/**
 * The filters an answer stands for, keeping only values that fit: valid dates in order,
 * lengths within limits.
 */
export function toSearchFilters(answer: SearchAnswer, context: SearchContext): SearchFilters {
  const keywords = (answer.keywords ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ARTIFACT_SEARCH_MAX_LENGTH)
    .trim();
  let updatedFrom = validDate(answer.updatedFrom);
  let updatedTo = validDate(answer.updatedTo);
  if (updatedFrom && updatedTo && updatedFrom > updatedTo) {
    [updatedFrom, updatedTo] = [updatedTo, updatedFrom];
  }
  const owner = [
    ...new Set(
      answer.owners
        .map((name) => name.trim().slice(0, ARTIFACT_OWNER_FILTER_MAX_LENGTH).trim())
        .filter(Boolean),
    ),
  ].slice(0, ARTIFACT_OWNERS_FILTER_MAX);
  return {
    scope: answer.scope ?? context.scope,
    q: keywords || undefined,
    type: answer.type ?? undefined,
    owner: owner.length ? owner : undefined,
    updatedFrom,
    updatedTo,
  };
}

function validDate(value: string | null): string | undefined {
  return value && dateSchema.safeParse(value).success ? value : undefined;
}
