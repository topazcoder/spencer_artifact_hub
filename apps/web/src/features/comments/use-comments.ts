import type { CreateCommentRequest, UpdateCommentRequest } from '@artifact-hub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  commentsQueryKey,
  commentThreadsQueryKey,
  createComment,
  deleteComment,
  fetchCommentThreads,
  updateComment,
} from './comments-api.ts';

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
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () => queryClient.invalidateQueries({ queryKey: commentsQueryKey(artifactId) }),
  });
}

export function useCreateComment(artifactId: string) {
  return useCommentChange(artifactId, (body: CreateCommentRequest) =>
    createComment(artifactId, body),
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
