import { apiErrorBodySchema, ErrorCode } from '@artifact-hub/shared';
import { ApiError } from './api-error.ts';
import type { ApiRequestOptions } from './api.types.ts';

const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";
const UNEXPECTED_RESPONSE_MESSAGE = 'The server sent an unexpected response. Please try again.';

/**
 * Calls the API on the same origin with the session cookie. Throws `ApiError` for error
 * responses and network failures, and validates success bodies with `schema`.
 */
export async function apiRequest<T = void>(
  path: string,
  { method = 'GET', body, schema, signal }: ApiRequestOptions<T> = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  const payload: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorBodySchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(res.status, ErrorCode.INTERNAL_ERROR, UNEXPECTED_RESPONSE_MESSAGE);
    }
    const { code, message, details, requestId } = parsed.data.error;
    throw new ApiError(res.status, code, message, details, requestId);
  }

  if (!schema) return undefined as T;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(res.status, ErrorCode.INTERNAL_ERROR, UNEXPECTED_RESPONSE_MESSAGE);
  }
  return parsed.data;
}
