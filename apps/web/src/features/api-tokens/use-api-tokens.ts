import type { CreateApiTokenRequest } from '@artifact-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  apiTokensQueryKey,
  createApiToken,
  fetchApiTokens,
  revokeApiToken,
} from './api-tokens-api.ts';

export function useApiTokens() {
  return useQuery({
    queryKey: apiTokensQueryKey,
    queryFn: ({ signal }) => fetchApiTokens(signal),
  });
}

export function useCreateApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApiTokenRequest) => createApiToken(body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: apiTokensQueryKey }),
  });
}

export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => revokeApiToken(tokenId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: apiTokensQueryKey }),
  });
}
