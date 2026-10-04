import {
  type ApiToken,
  apiTokenListResponseSchema,
  type CreateApiTokenRequest,
  type CreateApiTokenResponse,
  createApiTokenResponseSchema,
} from '@artifact-hub/shared';
import { apiRequest } from '@/lib/api/client.ts';

export const apiTokensQueryKey = ['api-tokens'] as const;

/** Live tokens, newest first. */
export async function fetchApiTokens(signal?: AbortSignal): Promise<ApiToken[]> {
  return (await apiRequest('/tokens', { schema: apiTokenListResponseSchema, signal })).items;
}

/** The response carries the full token, which the server never returns again. */
export async function createApiToken(body: CreateApiTokenRequest): Promise<CreateApiTokenResponse> {
  return apiRequest('/tokens', { method: 'POST', body, schema: createApiTokenResponseSchema });
}

export async function revokeApiToken(tokenId: string): Promise<void> {
  await apiRequest(`/tokens/${encodeURIComponent(tokenId)}`, { method: 'DELETE' });
}
