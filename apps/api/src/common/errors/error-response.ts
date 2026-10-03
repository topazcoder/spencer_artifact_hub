import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';
import type { ErrorResponse } from './errors.types.js';

export const GENERIC_ERROR_MESSAGE =
  'Something went wrong on our side. Please try again, and quote the request ID if it keeps happening.';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_TYPE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

function fromStatus(status: number, message: string): ErrorResponse {
  if (status >= 500) {
    return {
      status,
      code: CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR,
      message: GENERIC_ERROR_MESSAGE,
    };
  }
  return { status, code: CODE_BY_STATUS[status] ?? ErrorCode.BAD_REQUEST, message };
}

/** Errors raised by Express middleware (e.g. body-parser), built with `http-errors`. */
function isExposedHttpError(error: unknown): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

/** Maps any thrown value to the status, code and client-safe message sent to the client. */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'The request is invalid.',
      details: exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  if (exception instanceof HttpException) {
    return fromStatus(exception.getStatus(), exception.message);
  }
  if (isExposedHttpError(exception)) {
    return fromStatus(exception.status, exception.message);
  }
  return fromStatus(HttpStatus.INTERNAL_SERVER_ERROR, GENERIC_ERROR_MESSAGE);
}
