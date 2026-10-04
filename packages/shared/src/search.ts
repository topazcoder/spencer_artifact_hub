import { z } from 'zod';
import {
  ARTIFACT_LIST_SCOPES,
  ARTIFACT_SEARCH_MAX_LENGTH,
  artifactListQuerySchema,
} from './artifacts.js';

/** Query of `GET /api/search/interpret`: what the user typed, and the gallery tab they are on. */
export const searchInterpretQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Type what you are looking for.')
    .max(
      ARTIFACT_SEARCH_MAX_LENGTH,
      `Keep the search to ${ARTIFACT_SEARCH_MAX_LENGTH} characters.`,
    ),
  scope: z.enum(ARTIFACT_LIST_SCOPES).default('mine'),
});

export type SearchInterpretQuery = z.output<typeof searchInterpretQuerySchema>;

/** Gallery filters, as `GET /api/artifacts` takes them. */
export const searchFiltersSchema = artifactListQuerySchema.pick({
  scope: true,
  q: true,
  type: true,
  owner: true,
  updatedFrom: true,
  updatedTo: true,
});

export type SearchFilters = z.output<typeof searchFiltersSchema>;

/** Response of `GET /api/search/interpret`: a natural-language search turned into filters. */
export const searchInterpretationSchema = z.object({
  /**
   * False when AI isn't configured or failed. `filters` is then a plain search for the text in
   * the same scope, so the results are never empty because of AI.
   */
  interpreted: z.boolean(),
  filters: searchFiltersSchema,
});

export type SearchInterpretation = z.infer<typeof searchInterpretationSchema>;
