/** What a comment box holds. */
export interface CommentFormValues {
  body: string;
}

/** Which comments the Feedback tab shows: those on the version being viewed, or on all. */
export type FeedbackFilter = 'version' | 'all';
