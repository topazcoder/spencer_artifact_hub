import type {
  Artifact,
  CreateArtifactRequest,
  CreateVersionRequest,
  UpdateArtifactRequest,
} from '@artifact-hub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/api-error.ts';
import {
  artifactListQueryKey,
  artifactListsQueryKey,
  artifactQueryKey,
  artifactVersionsQueryKey,
  deleteArtifact,
  fetchArtifact,
  fetchArtifacts,
  fetchArtifactVersions,
  publishArtifact,
  publishVersion,
  updateArtifact,
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

export function useArtifactVersions(id: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: artifactVersionsQueryKey(id),
    queryFn: ({ signal }) => fetchArtifactVersions(id, signal),
    enabled,
  });
}

/** Caches a changed artifact and refreshes everything that shows it. */
function useArtifactChanged() {
  const queryClient = useQueryClient();
  return (artifact: Artifact) => {
    queryClient.setQueryData(artifactQueryKey(artifact.id), artifact);
    void queryClient.invalidateQueries({ queryKey: artifactVersionsQueryKey(artifact.id) });
    void queryClient.invalidateQueries({ queryKey: artifactListsQueryKey });
  };
}

export function usePublishVersion(id: string) {
  const onChanged = useArtifactChanged();
  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: CreateVersionRequest }) =>
      publishVersion(id, file, metadata),
    onSuccess: onChanged,
  });
}

export function useUpdateArtifact(id: string) {
  const onChanged = useArtifactChanged();
  return useMutation({
    mutationFn: (changes: UpdateArtifactRequest) => updateArtifact(id, changes),
    onSuccess: onChanged,
  });
}

/**
 * `leavePage` navigates away from the artifact; its queries are dropped only after that, so
 * the page doesn't refetch the artifact and flash "not found" on its way out.
 */
export function useDeleteArtifact(id: string, leavePage: () => void | Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteArtifact(id),
    onSuccess: async () => {
      await leavePage();
      queryClient.removeQueries({ queryKey: artifactQueryKey(id) });
      void queryClient.invalidateQueries({ queryKey: artifactListsQueryKey });
    },
  });
}
