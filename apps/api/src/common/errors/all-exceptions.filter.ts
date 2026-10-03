import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { ApiErrorBody } from '@artifact-hub/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { toErrorResponse } from './error-response.js';

/** Turns every error raised during an HTTP request into `{ error: { code, message, details?, requestId } }`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;

    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const { status, code, message, details } = toErrorResponse(exception);

    if (status >= 500) {
      this.logger.error({ err: exception, code }, 'Request failed with an unexpected error');
    }

    if (res.headersSent) {
      // A streamed response was interrupted; the only thing left to do is close it.
      res.destroy();
      return;
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
        ...(req.id === undefined ? {} : { requestId: String(req.id) }),
      },
    };
    res.status(status).json(body);
  }
}
