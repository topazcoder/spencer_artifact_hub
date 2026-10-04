import { apiErrorBodySchema, ErrorCode, IDEMPOTENCY_KEY_HEADER } from '@artifact-hub/shared';
import { ApiError } from './api-error.ts';
import type { ApiRequestOptions } from './api.types.ts';

const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";
const UNEXPECTED_RESPONSE_MESSAGE = 'The server sent an unexpected response. Please try again.';

/**
 * Calls the API on the same origin with the session cookie. Throws `ApiError` for error
 * responses and network failures, and validates success bodies with `schema`. A `FormData`
 * body is sent as multipart (the browser sets the boundary); anything else as JSON.
 */
export async function apiRequest<T = void>(
  path: string,
  { method = 'GET', body, schema, signal, idempotencyKey }: ApiRequestOptions<T> = {},
): Promise<T> {
  const isJson = body !== undefined && !(body instanceof FormData);
  const res = await send(path, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } : {}),
    },
    body: isJson ? JSON.stringify(body) : (body as FormData | undefined),
  });

  const payload: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw toApiError(res.status, payload);

  if (!schema) return undefined as T;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(res.status, ErrorCode.INTERNAL_ERROR, UNEXPECTED_RESPONSE_MESSAGE);
  }
  return parsed.data;
}

/**
 * Fetches non-JSON content (artifact bytes) from the API, with the same error handling as
 * `apiRequest`. Returns the successful response for the caller to read.
 */
export async function apiFetchContent(
  path: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<Response> {
  const res = await send(path, { signal });
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => undefined));
  return res;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`/api${path}`, { ...init, credentials: 'same-origin' });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const parsed = apiErrorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiError(status, ErrorCode.INTERNAL_ERROR, UNEXPECTED_RESPONSE_MESSAGE);
  }
  const { code, message, details, requestId } = parsed.data.error;
  return new ApiError(status, code, message, details, requestId);
}
