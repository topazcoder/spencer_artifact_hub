import type { FeedbackSummaryResponse } from '@artifact-hub/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { FeedbackSummaryContent, FeedbackSummaryView } from './feedback-summaries.types.js';

/**
 * An AI summary of the comments on some versions of an artifact. Comments on a version are the
 * same for everyone who can see it, so summaries are shared between viewers.
 */
@Entity('feedback_summaries')
export class FeedbackSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  artifactId: string;

  /**
   * The versions whose comments it covers, sorted; empty for every version. Viewers limited to
   * pinned versions get summaries of those versions only.
   */
  @Column('uuid', { array: true })
  versionIds: string[];

  @Column('jsonb')
  summary: FeedbackSummaryContent;

  /** SHA-256 of the comments as summarized: when the comments hash differently, it's outdated. */
  @Column('char', { length: 64 })
  inputHash: string;

  @Column('int')
  commentCount: number;

  /** Some threads didn't fit the size budget and were left out. */
  @Column('boolean')
  partial: boolean;

  @Column('text')
  model: string;

  @Column('timestamptz')
  generatedAt: Date;
}

export function toFeedbackSummaryResponse({
  saved,
  outdated,
  versionNo,
}: FeedbackSummaryView): FeedbackSummaryResponse {
  return {
    summary: saved && {
      ...saved.summary,
      versionNo: versionNo ?? null,
      commentCount: saved.commentCount,
      partial: saved.partial,
      generatedAt: saved.generatedAt.toISOString(),
    },
    outdated,
  };
}
