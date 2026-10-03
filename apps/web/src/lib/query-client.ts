import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { currentUserQueryKey } from '@/features/auth/auth-api.ts';
import { isApiError } from './api/api-error.ts';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  // An expired session on any request signs the user out, so protected routes redirect to login.
  const onError = (error: unknown) => {
    if (isApiError(error, 'UNAUTHENTICATED')) queryClient.setQueryData(currentUserQueryKey, null);
  };

  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        // Queries are GETs, so retrying is safe, but only when the failure was not the request's fault.
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && isApiError(error) && error.isTransient,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  return queryClient;
}
