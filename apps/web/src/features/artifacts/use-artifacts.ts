import type { CreateArtifactRequest } from '@artifact-hub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/api-error.ts';
import {
  artifactListQueryKey,
  artifactListsQueryKey,
  artifactQueryKey,
  fetchArtifact,
  fetchArtifacts,
  publishArtifact,
} from './artifacts-api.ts';
import type { ArtifactListParams } from './artifacts.types.ts';

export function useArtifact(id: string) {
  return useQuery({
    queryKey: artifactQueryKey(id),
    queryFn: ({ signal }) => fetchArtifact(id, signal),
    // A 404 won't change by asking again.
    retry: (failureCount, error) => !isApiError(error, 'NOT_FOUND') && failureCount < 2,
  });
}

export function useArtifactList(params: ArtifactListParams) {
  return useQuery({
    queryKey: artifactListQueryKey(params),
    queryFn: ({ signal }) => fetchArtifacts(params, signal),
    // Keep showing the current page while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function usePublishArtifact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: CreateArtifactRequest }) =>
      publishArtifact(file, metadata),
    onSuccess: (artifact) => {
      queryClient.setQueryData(artifactQueryKey(artifact.id), artifact);
      void queryClient.invalidateQueries({ queryKey: artifactListsQueryKey });
    },
  });
}
