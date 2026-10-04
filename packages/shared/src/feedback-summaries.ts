import { z } from 'zod';
import { blankAsUndefined } from './artifacts.js';

/** How the comments in a theme feel about the artifact. */
export const FEEDBACK_SENTIMENTS = ['positive', 'negative', 'mixed', 'neutral'] as const;
export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number];

/** Whether a theme's threads are still open, all resolved, or some of each. */
export const FEEDBACK_THEME_STATUSES = ['open', 'resolved', 'mixed'] as const;
export type FeedbackThemeStatus = (typeof FEEDBACK_THEME_STATUSES)[number];

/** Query of `GET` and `POST /api/artifacts/:id/feedback-summary`. */
export const feedbackSummaryQuerySchema = z.object({
  /** One version's feedback; absent = every version the caller can see. */
  version: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().optional()),
});

export type FeedbackSummaryQuery = z.output<typeof feedbackSummaryQuerySchema>;

/** Written by AI from comments: plain text, never render it as HTML. */
export const feedbackSummarySchema = z.object({
  overview: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      sentiment: z.enum(FEEDBACK_SENTIMENTS),
      status: z.enum(FEEDBACK_THEME_STATUSES),
      /** The comments the theme comes from. Some may have been deleted since. */
      commentIds: z.array(z.uuid()),
    }),
  ),
  /** Where reviewers want different things. */
  disagreements: z.array(
    z.object({ topic: z.string(), summary: z.string(), commentIds: z.array(z.uuid()) }),
  ),
  /** The version summarized; null for every version the caller can see. */
  versionNo: z.number().int().positive().nullable(),
  /** Comments and replies summarized. */
  commentCount: z.number().int().nonnegative(),
  /** There were too many comments to send them all; the oldest threads were summarized. */
  partial: z.boolean(),
  generatedAt: z.iso.datetime(),
});

export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;

/**
 * Response of `GET` (the saved summary) and `POST` (summarize now) on
 * `/api/artifacts/:id/feedback-summary`. `summary` is null when there is none yet, or no
 * comments to summarize.
 */
export const feedbackSummaryResponseSchema = z.object({
  summary: feedbackSummarySchema.nullable(),
  /** Comments were added, changed, resolved or deleted since it was written. */
  outdated: z.boolean(),
});

export type FeedbackSummaryResponse = z.infer<typeof feedbackSummaryResponseSchema>;
