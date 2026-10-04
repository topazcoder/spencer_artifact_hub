import type { FeedbackSummary as FeedbackSummaryDto } from '@artifact-hub/shared';
import type { z } from 'zod';
import type { FeedbackSummary } from './feedback-summary.entity.js';
import type { feedbackSummaryAnswerSchema } from './feedback-summary-prompt.js';

/** The model's summary, before `toSummaryContent` checks it. */
export type FeedbackSummaryAnswer = z.output<typeof feedbackSummaryAnswerSchema>;

/** What a saved summary says. */
export type FeedbackSummaryContent = Pick<
  FeedbackSummaryDto,
  'overview' | 'themes' | 'disagreements'
>;

/** The comments of a summary, as the model reads them. */
export interface SummaryInput {
  /** The threads, each comment labelled with a short ref (`c1`, `c2`, …). */
  text: string;
  /** Each ref's comment id. */
  refs: ReadonlyMap<string, string>;
  /** Comments and replies in `text`. */
  commentCount: number;
  /** Some threads didn't fit the size budget and were left out. */
  partial: boolean;
}

/** The saved summary of some comments, if any, and whether the comments changed since. */
export interface FeedbackSummaryView {
  saved: FeedbackSummary | null;
  outdated: boolean;
  /** The version it covers; undefined for every version the user can see. */
  versionNo: number | undefined;
}

/** The comments a summary covers, and the key it is saved under. */
export interface SummaryScope {
  artifactId: string;
  title: string;
  versionNo: number | undefined;
  /** Sorted; empty for every version. */
  versionIds: string[];
  input: SummaryInput;
  /** SHA-256 of `input.text`. */
  inputHash: string;
}
