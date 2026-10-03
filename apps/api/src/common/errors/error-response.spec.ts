import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { z } from 'zod';
import { AppError } from './app-error.js';
import { GENERIC_ERROR_MESSAGE, toErrorResponse } from './error-response.js';

describe('toErrorResponse', () => {
  it('maps domain errors by code, keeping message and details', () => {
    const error = new AppError(ErrorCode.SHARE_RECIPIENT_UNKNOWN, 'Unknown emails', {
      emails: ['x@example.com'],
    });
    expect(toErrorResponse(error)).toEqual({
      status: 422,
      code: ErrorCode.SHARE_RECIPIENT_UNKNOWN,
      message: 'Unknown emails',
      details: { emails: ['x@example.com'] },
    });
  });

  it('maps zod errors to VALIDATION_FAILED with per-field details', () => {
    const result = z.object({ title: z.string() }).safeParse({ title: 1 });
    expect(result.success).toBe(false);
    expect(toErrorResponse(result.error)).toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      details: [{ path: 'title', message: expect.any(String) }],
    });
  });

  it.each([
    [new NotFoundException('Cannot GET /api/nope'), 404, ErrorCode.NOT_FOUND],
    [new BadRequestException('Bad'), 400, ErrorCode.BAD_REQUEST],
    [new PayloadTooLargeException(), 413, ErrorCode.PAYLOAD_TOO_LARGE],
  ])('maps Nest HTTP exceptions by status (%#)', (error, status, code) => {
    expect(toErrorResponse(error)).toMatchObject({ status, code, message: error.message });
  });

  it('maps exposed client errors from Express middleware', () => {
    const error = Object.assign(new SyntaxError('Unexpected token'), { status: 400, expose: true });
    expect(toErrorResponse(error)).toMatchObject({ status: 400, code: ErrorCode.BAD_REQUEST });
  });

  it('hides the details of unknown errors', () => {
    expect(toErrorResponse(new Error('db password is hunter2'))).toEqual({
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: GENERIC_ERROR_MESSAGE,
    });
  });
});
