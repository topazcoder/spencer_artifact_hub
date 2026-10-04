import type { ArtifactListScope } from '@artifact-hub/shared';
import type { OwnerSummary } from '../artifacts/artifacts.types.js';
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
  /** Other people whose artifacts they can see, the most artifacts first. */
  owners: readonly OwnerSummary[];
  /** `YYYY-MM-DD` (UTC), for "last week" and the like. */
  today: string;
}
