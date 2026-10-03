import {
  type ArtifactAccess,
  type SetCompanyAccessRequest,
  type SetShareLinkRequest,
  type SharePeopleRequest,
  type UpdatePersonAccessRequest,
  USER_SEARCH_MIN_LENGTH,
} from '@artifact-hub/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { artifactListsQueryKey, artifactQueryKey } from '@/features/artifacts/artifacts-api.ts';
import { useDebouncedValue } from '@/lib/use-debounced-value.ts';
import {
  accessQueryKey,
  fetchAccess,
  removePerson,
  searchUsers,
  fetchSharedArtifact,
  resetShareLink,
  setCompanyAccess,
  setShareLink,
  sharedArtifactQueryKey,
  sharePeople,
  turnOffShareLink,
  updatePerson,
  userSearchQueryKey,
} from './sharing-api.ts';

export function useAccess(artifactId: string, { enabled = true } = {}) {
  return useQuery({
    queryKey: accessQueryKey(artifactId),
    queryFn: ({ signal }) => fetchAccess(artifactId, signal),
    enabled,
  });
}

/**
 * Every change returns the access as it is now. Caches it, and refreshes the artifact (its
 * visibility) and the lists it appears in.
 */
function useAccessChange<T>(artifactId: string, change: (input: T) => Promise<ArtifactAccess>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: (access) => {
      queryClient.setQueryData(accessQueryKey(artifactId), access);
      void queryClient.invalidateQueries({ queryKey: artifactQueryKey(artifactId), exact: true });
      void queryClient.invalidateQueries({ queryKey: artifactListsQueryKey });
    },
  });
}

export function useSetCompanyAccess(artifactId: string) {
  return useAccessChange(artifactId, (body: SetCompanyAccessRequest) =>
    setCompanyAccess(artifactId, body),
  );
}

export function useSharePeople(artifactId: string) {
  return useAccessChange(artifactId, (body: SharePeopleRequest) => sharePeople(artifactId, body));
}

export function useUpdatePerson(artifactId: string) {
  return useAccessChange(
    artifactId,
    ({ userId, ...body }: UpdatePersonAccessRequest & { userId: string }) =>
      updatePerson(artifactId, userId, body),
  );
}

export function useRemovePerson(artifactId: string) {
  return useAccessChange(artifactId, (userId: string) => removePerson(artifactId, userId));
}

export function useSetShareLink(artifactId: string) {
  return useAccessChange(artifactId, (body: SetShareLinkRequest) => setShareLink(artifactId, body));
}

export function useTurnOffShareLink(artifactId: string) {
  return useAccessChange(artifactId, () => turnOffShareLink(artifactId));
}

export function useResetShareLink(artifactId: string) {
  return useAccessChange(artifactId, () => resetShareLink(artifactId));
}

/** What a share link shows; a link that doesn't work won't start working on a retry. */
export function useSharedArtifact(token: string) {
  return useQuery({
    queryKey: sharedArtifactQueryKey(token),
    queryFn: ({ signal }) => fetchSharedArtifact(token, signal),
    retry: false,
  });
}

/** Suggestions for the people picker, once the user pauses typing 3+ characters. */
export function useUserSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 250);
  return useQuery({
    queryKey: userSearchQueryKey(debounced),
    queryFn: ({ signal }) => searchUsers(debounced, signal),
    enabled: debounced.length >= USER_SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
