import type { CommentThreadView } from '../../comments/comments.types.js';
import type { FeedbackCounts, ThreadCounts } from './feedback.types.js';

/** Counts open and resolved threads, overall and per version. */
export function countFeedback(threads: CommentThreadView[]): FeedbackCounts {
  const byVersion = new Map<number, ThreadCounts>();
  const total: ThreadCounts = { open: 0, resolved: 0 };
  for (const { comment } of threads) {
    const key = comment.resolvedAt ? 'resolved' : 'open';
    const counts = byVersion.get(comment.version.versionNo) ?? { open: 0, resolved: 0 };
    counts[key] += 1;
    total[key] += 1;
    byVersion.set(comment.version.versionNo, counts);
  }
  return {
    ...total,
    byVersion: [...byVersion.entries()]
      .toSorted(([a], [b]) => b - a)
      .map(([versionNo, counts]) => ({ versionNo, ...counts })),
  };
}
