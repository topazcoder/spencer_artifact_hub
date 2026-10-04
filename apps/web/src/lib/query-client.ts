import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { currentUserQueryKey } from '@/features/auth/auth-api.ts';
import { isApiError } from './api/api-error.ts';

const MAX_RETRIES = 2;

/**
 * Retries a failure that wasn't the request's fault (network, server error). For queries,
 * and for mutations sent with an `Idempotency-Key`, which the server does only once.
 */
export function retryTransient(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isApiError(error) && error.isTransient;
}

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
        // Queries are GETs, so retrying is safe.
        retry: retryTransient,
        refetchOnWindowFocus: false,
      },
      // Only mutations safe to repeat retry: they opt in with `retryTransient`.
      mutations: { retry: false },
    },
  });
  return queryClient;
}
