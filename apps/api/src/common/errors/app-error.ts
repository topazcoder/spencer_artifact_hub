import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';

export const ERROR_HTTP_STATUS: Record<ErrorCode, HttpStatus> = {
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  ARTIFACT_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  UNSUPPORTED_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  UPLOAD_SESSION_EXPIRED: HttpStatus.GONE,
  UPLOAD_SESSION_USED: HttpStatus.CONFLICT,
  SHARE_RECIPIENT_UNKNOWN: HttpStatus.UNPROCESSABLE_ENTITY,
  SHARE_EXPIRED: HttpStatus.GONE,
  SHARE_REVOKED: HttpStatus.GONE,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  AI_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * A domain error with a stable code. Services throw these; the HTTP filter and the
 * MCP adapter translate them for their transport.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): HttpStatus {
    return ERROR_HTTP_STATUS[this.code];
  }
}
