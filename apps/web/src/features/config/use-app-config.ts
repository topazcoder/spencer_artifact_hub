import { appConfigSchema } from '@artifact-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api/client.ts';

/** Server settings for the client (`GET /api/config`); fixed for the life of the page. */
export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => apiRequest('/config', { schema: appConfigSchema, signal }),
    staleTime: Infinity,
  });
}
