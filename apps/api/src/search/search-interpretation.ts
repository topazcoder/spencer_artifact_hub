import {
  ARTIFACT_LIST_SCOPES,
  ARTIFACT_OWNER_FILTER_MAX_LENGTH,
  ARTIFACT_SEARCH_MAX_LENGTH,
  ARTIFACT_TYPE_FILTERS,
  type ArtifactTypeFilter,
  artifactTagSchema,
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
  keywords: z.string().nullable().describe('1 to 3 distinctive words to find, or null.'),
  scope: z.enum(ARTIFACT_LIST_SCOPES).nullable(),
  type: z.enum(TYPES).nullable(),
  tag: z.string().nullable().describe('One of the tags in use, or null.'),
  owner: z.string().nullable().describe('The name of the person who published it, or null.'),
  updatedFrom: z.string().nullable().describe('YYYY-MM-DD, or null.'),
  updatedTo: z.string().nullable().describe('YYYY-MM-DD, or null.'),
});

export const SEARCH_SYSTEM_PROMPT = `You turn a search typed in Artifact Hub's gallery into filters. Artifact Hub is where a company's team publishes AI-generated artifacts (HTML pages, images, PDFs, Markdown, SVG) to browse, review and share.

Fill a field only when the search asks for it; otherwise null.
- keywords: 1 to 3 distinctive words to find in titles, descriptions and content. Every word must match, so leave out filler words, and anything that goes in another field (people, dates, kinds of file, tags). "the pricing deck Sara shared last week" → "pricing".
- scope: where to look. "mine": published by the user. "shared": shared with the user by name. "public": shared with everyone at the company. Null keeps the current tab, except when the search asks for someone else's artifacts while the current tab is "mine": then "shared", or "public" if it mentions the company or the team.
- type: when the search names a kind of file. html: web pages, mockups, prototypes. image: screenshots, photos, PNG, JPEG. pdf: PDF files. markdown: docs, notes, READMEs. svg: diagrams, icons, vector graphics.
- tag: one of the tags in use, when the search clearly refers to it. Never invent a tag.
- owner: the person who published it, as the search names them ("Sara"). Null when it is the user ("my", "I"): use scope "mine" instead.
- updatedFrom, updatedTo: the days it was last updated, inclusive, as YYYY-MM-DD. Work them out from today's date for "yesterday", "last week", "in September" and the like.

${UNTRUSTED_CONTENT_RULE}`;

/** The task's input: the search, and what it is read against. */
export function searchPrompt({ text, scope, tags, today }: SearchContext): string {
  return [
    `Today is ${today} (UTC). The current tab is "${scope}".`,
    `Tags in use:\n${untrustedBlock('tags', tags.join(', ') || '(none)')}`,
    `The search:\n${untrustedBlock('search', text)}`,
  ].join('\n\n');
}

const dateSchema = z.iso.date();

/**
 * The filters an answer stands for, keeping only values that fit: a known tag (an unknown one
 * becomes a keyword), valid dates in order, lengths within limits.
 */
export function toSearchFilters(answer: SearchAnswer, context: SearchContext): SearchFilters {
  const tag = artifactTagSchema.safeParse(answer.tag ?? '');
  const knownTag = tag.success && context.tags.includes(tag.data) ? tag.data : undefined;
  const keywords = [answer.keywords, knownTag ? null : answer.tag]
    .map((words) => words?.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, ARTIFACT_SEARCH_MAX_LENGTH)
    .trim();
  let updatedFrom = validDate(answer.updatedFrom);
  let updatedTo = validDate(answer.updatedTo);
  if (updatedFrom && updatedTo && updatedFrom > updatedTo) {
    [updatedFrom, updatedTo] = [updatedTo, updatedFrom];
  }
  const owner = answer.owner?.trim().slice(0, ARTIFACT_OWNER_FILTER_MAX_LENGTH).trim();
  return {
    scope: answer.scope ?? context.scope,
    q: keywords || undefined,
    type: answer.type ?? undefined,
    tag: knownTag ? [knownTag] : undefined,
    owner: owner || undefined,
    updatedFrom,
    updatedTo,
  };
}

function validDate(value: string | null): string | undefined {
  return value && dateSchema.safeParse(value).success ? value : undefined;
}
