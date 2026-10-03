import type { ErrorCode } from '@artifact-hub/shared';

export interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}
