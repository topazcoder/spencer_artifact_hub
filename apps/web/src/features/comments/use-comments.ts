import type { CreateCommentRequest, UpdateCommentRequest } from '@artifact-hub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  commentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  deleteComment,
  feedbackSummaryQueryKey,
  fetchCommentThreads,
  fetchFeedbackSummary,
  summarizeFeedback,
  updateComment,
} from './comments-api.ts';
import { submissionKey } from '@/lib/api/submission-key.ts';
import { retryTransient } from '@/lib/query-client.ts';

/** One version's threads, or every version's (`versionNo` null). */
export function useCommentThreads(artifactId: string, versionNo: number | null) {
  return useQuery({
    queryKey: commentThreadsQueryKey(artifactId, versionNo),
    queryFn: ({ signal }) => fetchCommentThreads(artifactId, versionNo, signal),
    // Keep the threads on screen while switching between this version and all versions.
    placeholderData: keepPreviousData,
  });
}

/**
 * Refreshes every list of the artifact's comments once a change is done, whether it worked or
 * not: a failure may mean the comment is gone, or the user can no longer change it.
 */
function useCommentChange<TInput, TResult>(
  artifactId: string,
  change: (input: TInput) => Promise<TResult>,
  { retry = false }: { retry?: typeof retryTransient | false } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    retry,
    onSettled: () => queryClient.invalidateQueries({ queryKey: commentsQueryKey(artifactId) }),
  });
}

export function useCreateComment(artifactId: string) {
  return useCommentChange(
    artifactId,
    (body: CreateCommentRequest) => createComment(artifactId, body, submissionKey(body)),
    { retry: retryTransient },
  );
}

export function useUpdateComment(artifactId: string) {
  return useCommentChange(
    artifactId,
    ({ commentId, ...body }: UpdateCommentRequest & { commentId: string }) =>
      updateComment(commentId, body),
  );
}

export function useDeleteComment(artifactId: string) {
  return useCommentChange(artifactId, (commentId: string) => deleteComment(commentId));
}

/** The saved AI summary of one version's comments, or every version's (`versionNo` null). */
export function useFeedbackSummary(
  artifactId: string,
  versionNo: number | null,
  { enabled }: { enabled: boolean },
) {
  return useQuery({
    queryKey: feedbackSummaryQueryKey(artifactId, versionNo),
    queryFn: ({ signal }) => fetchFeedbackSummary(artifactId, versionNo, signal),
    enabled,
  });
}

/** Summarizes the comments now; the result replaces the saved summary in the cache. */
export function useSummarizeFeedback(artifactId: string, versionNo: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => summarizeFeedback(artifactId, versionNo),
    onSuccess: (data) =>
      queryClient.setQueryData(feedbackSummaryQueryKey(artifactId, versionNo), data),
  });
}
