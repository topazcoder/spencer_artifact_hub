import type { User } from '@artifact-hub/shared';
import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserQueryKey, fetchCurrentUser, login, logout, signup } from './auth-api.ts';

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: fetchCurrentUser,
    // Changes only through login/signup/logout (which update the cache) or a 401.
    staleTime: Infinity,
  });
}

function useSetCurrentUser() {
  const queryClient = useQueryClient();
  return (user: User) => queryClient.setQueryData(currentUserQueryKey, user);
}

export function useLogin() {
  const setCurrentUser = useSetCurrentUser();
  return useMutation({ mutationFn: login, onSuccess: setCurrentUser });
}

export function useSignup() {
  const setCurrentUser = useSetCurrentUser();
  return useMutation({ mutationFn: signup, onSuccess: setCurrentUser });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      // Mark the session as signed out (the route guards react to it), then drop everything
      // else cached for this user. `clear()` would also detach the guards from the user query.
      queryClient.setQueryData(currentUserQueryKey, null);
      const currentUserHash = hashKey(currentUserQueryKey);
      queryClient.removeQueries({ predicate: (query) => query.queryHash !== currentUserHash });
    },
  });
}
