/** Open and resolved threads (top-level comments). */
export interface ThreadCounts {
  open: number;
  resolved: number;
}

/** Thread counts overall and for each version that has comments, newest version first. */
export interface FeedbackCounts extends ThreadCounts {
  byVersion: (ThreadCounts & { versionNo: number })[];
}
