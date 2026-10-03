import { ErrorCode } from '@artifact-hub/shared';
import type { ClientErrorCode, FieldIssue } from './api.types.ts';

/** An error returned by the API (`{ error: { code, message, details?, requestId? } }`) or a network failure. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages of a `VALIDATION_FAILED` error. */
  get fieldIssues(): FieldIssue[] {
    if (this.code !== ErrorCode.VALIDATION_FAILED || !Array.isArray(this.details)) return [];
    return this.details.filter(
      (issue): issue is FieldIssue =>
        typeof issue?.path === 'string' && typeof issue?.message === 'string',
    );
  }

  /** Worth retrying: the server was unreachable or failed, not the request itself. */
  get isTransient(): boolean {
    return this.code === 'NETWORK_ERROR' || this.status >= 500;
  }
}

export function isApiError(error: unknown, code?: ClientErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** A user-facing message, with the request ID for server failures so it can be reported. */
export function describeError(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  if (error.status >= 500 && error.requestId) {
    return `${error.message} (request ID: ${error.requestId})`;
  }
  return error.message;
}
