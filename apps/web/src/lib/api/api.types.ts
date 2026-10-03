import type { ErrorCode } from '@artifact-hub/shared';
import type { z } from 'zod';

/** API error codes, plus the client-side code for requests that never reached the server. */
export type ClientErrorCode = ErrorCode | 'NETWORK_ERROR';

export interface ApiRequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Validates the success response. Omit for endpoints that return no content. */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

/** One entry of a `VALIDATION_FAILED` error's details. */
export interface FieldIssue {
  path: string;
  message: string;
}
