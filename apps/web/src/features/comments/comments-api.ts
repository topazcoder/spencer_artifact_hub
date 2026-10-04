import {
  type Comment,
  type CommentThread,
  commentListResponseSchema,
  commentResponseSchema,
  type CreateCommentRequest,
  type FeedbackSummaryResponse,
  feedbackSummaryResponseSchema,
  type UpdateCommentRequest,
} from '@artifact-hub/shared';
import { artifactQueryKey } from '@/features/artifacts/artifacts-api.ts';
import { apiRequest } from '@/lib/api/client.ts';

/** Under the artifact's key, so they go with the artifact's other queries. */
export const commentsQueryKey = (artifactId: string) =>
  [...artifactQueryKey(artifactId), 'comments'] as const;
/** One version's threads, or every version's (`versionNo` null). */
export const commentThreadsQueryKey = (artifactId: string, versionNo: number | null) =>
  [...commentsQueryKey(artifactId), versionNo ?? 'all'] as const;

/**
 * The AI summary of one version's comments, or every version's (`versionNo` null). Under the
 * comments' key, so a change to the comments refreshes whether it is outdated.
 */
export const feedbackSummaryQueryKey = (artifactId: string, versionNo: number | null) =>
  [...commentsQueryKey(artifactId), 'summary', versionNo ?? 'all'] as const;

const commentsPath = (artifactId: string) =>
  `/artifacts/${encodeURIComponent(artifactId)}/comments`;
const commentPath = (commentId: string) => `/comments/${encodeURIComponent(commentId)}`;

/** Threads oldest first, resolved ones included; `versionNo` null for every visible version. */
export async function fetchCommentThreads(
  artifactId: string,
  versionNo: number | null,
  signal?: AbortSignal,
): Promise<CommentThread[]> {
  const query = versionNo === null ? '' : `?${new URLSearchParams({ version: String(versionNo) })}`;
  return (
    await apiRequest(`${commentsPath(artifactId)}${query}`, {
      schema: commentListResponseSchema,
      signal,
    })
  ).items;
}

/** With the same `idempotencyKey`, a retry returns the comment the first attempt posted. */
export async function createComment(
  artifactId: string,
  body: CreateCommentRequest,
  idempotencyKey?: string,
): Promise<Comment> {
  return (
    await apiRequest(commentsPath(artifactId), {
      method: 'POST',
      body,
      schema: commentResponseSchema,
      idempotencyKey,
    })
  ).comment;
}

/** Edits the body, or resolves or reopens a top-level comment. Author only. */
export async function updateComment(
  commentId: string,
  body: UpdateCommentRequest,
): Promise<Comment> {
  return (
    await apiRequest(commentPath(commentId), {
      method: 'PATCH',
      body,
      schema: commentResponseSchema,
    })
  ).comment;
}

/** A deleted top-level comment takes its replies with it. Author only. */
export async function deleteComment(commentId: string): Promise<void> {
  await apiRequest(commentPath(commentId), { method: 'DELETE' });
}

const summaryPath = (artifactId: string, versionNo: number | null) =>
  `/artifacts/${encodeURIComponent(artifactId)}/feedback-summary${
    versionNo === null ? '' : `?${new URLSearchParams({ version: String(versionNo) })}`
  }`;

/** The saved summary, if any, and whether comments changed since. */
export function fetchFeedbackSummary(
  artifactId: string,
  versionNo: number | null,
  signal?: AbortSignal,
): Promise<FeedbackSummaryResponse> {
  return apiRequest(summaryPath(artifactId, versionNo), {
    schema: feedbackSummaryResponseSchema,
    signal,
  });
}

/** Summarizes now (the saved summary if it is up to date). `AI_UNAVAILABLE` when AI fails. */
export function summarizeFeedback(
  artifactId: string,
  versionNo: number | null,
): Promise<FeedbackSummaryResponse> {
  return apiRequest(summaryPath(artifactId, versionNo), {
    method: 'POST',
    schema: feedbackSummaryResponseSchema,
  });
}
