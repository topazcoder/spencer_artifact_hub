import type { ArtifactListScope } from '@artifact-hub/shared';
import type { z } from 'zod';
import type { searchAnswerSchema } from './search-interpretation.js';

/** The model's reading of a search, before `toSearchFilters` checks it. */
export type SearchAnswer = z.output<typeof searchAnswerSchema>;

/** What a search is read against. */
export interface SearchContext {
  /** What the user typed. */
  text: string;
  /** The gallery tab they searched from. */
  scope: ArtifactListScope;
  /** Tags on the artifacts they can see, the most used first. */
  tags: readonly string[];
  /** `YYYY-MM-DD` (UTC), for "last week" and the like. */
  today: string;
}
