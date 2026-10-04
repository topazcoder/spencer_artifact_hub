import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { artifactQueryKey } from '@/features/artifacts/artifacts-api.ts';
import { isApiError } from '@/lib/api/api-error.ts';
import {
  fetchUploadSession,
  uploadSessionQueryKey,
  uploadToSession,
} from './upload-sessions-api.ts';

export function useUploadSession(token: string) {
  return useQuery({
    queryKey: uploadSessionQueryKey(token),
    queryFn: ({ signal }) => fetchUploadSession(token, signal),
    // A link that doesn't work won't start working on a retry.
    retry: (count, error) => !isApiError(error, 'NOT_FOUND') && count < 2,
  });
}

/** On success the session is `done`; on failure it may have expired or been used meanwhile. */
export function useUploadToSession(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadToSession(token, file),
    onSuccess: (artifact) =>
      queryClient.invalidateQueries({ queryKey: artifactQueryKey(artifact.id) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: uploadSessionQueryKey(token) }),
  });
}
