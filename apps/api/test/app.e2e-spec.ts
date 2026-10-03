import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import { apiErrorBodySchema, appConfigSchema, ErrorCode } from '@artifact-hub/shared';
import request from 'supertest';
import { z } from 'zod';
import { Public } from '../src/auth/auth.decorators.js';
import { AppError } from '../src/common/errors/app-error.js';
import { GENERIC_ERROR_MESSAGE } from '../src/common/errors/error-response.js';
import { createTestApp } from './create-test-app.js';
import { testEnv } from './test-env.js';

@Public()
@Controller('test-errors')
class ErrorsTestController {
  @Get('domain')
  domain() {
    throw new AppError(ErrorCode.CONFLICT, 'Already exists', { field: 'title' });
  }

  @Get('validation')
  validation() {
    z.object({ title: z.string().min(1) }).parse({ title: '' });
  }

  @Get('crash')
  crash() {
    throw new Error('secret internals');
  }

  @Post('echo')
  echo() {
    return { ok: true };
  }
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ErrorsTestController] });
  });

  afterAll(async () => {
    await app.close();
  });

  async function expectError(path: string, status: number, code: ErrorCode) {
    const res = await request(app.getHttpServer())
      .get(path)
      .set('X-Request-Id', 'req-1')
      .expect(status);
    const body = apiErrorBodySchema.parse(res.body);
    expect(body.error.code).toBe(code);
    expect(body.error.requestId).toBe('req-1');
    return body.error;
  }

  describe('GET /api/health', () => {
    it('returns ok with a generated request id', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', checks: { database: 'up', storage: 'up' } });
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('echoes a well-formed incoming request id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('X-Request-Id', 'client-trace-42')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('client-trace-42');
    });
  });

  describe('GET /api/config', () => {
    it('returns the client configuration without a session', async () => {
      const res = await request(app.getHttpServer()).get('/api/config').expect(200);
      expect(appConfigSchema.parse(res.body)).toEqual({
        maxArtifactBytes: testEnv.MAX_ARTIFACT_BYTES,
      });
    });
  });

  describe('error responses', () => {
    it('returns NOT_FOUND for unknown routes', async () => {
      await expectError('/api/does-not-exist', 404, ErrorCode.NOT_FOUND);
    });

    it('returns domain errors with their code and details', async () => {
      const error = await expectError('/api/test-errors/domain', 409, ErrorCode.CONFLICT);
      expect(error).toMatchObject({ message: 'Already exists', details: { field: 'title' } });
    });

    it('returns VALIDATION_FAILED for zod errors', async () => {
      const error = await expectError(
        '/api/test-errors/validation',
        400,
        ErrorCode.VALIDATION_FAILED,
      );
      expect(error.details).toEqual([{ path: 'title', message: expect.any(String) }]);
    });

    it('hides unexpected errors behind a generic message', async () => {
      const error = await expectError('/api/test-errors/crash', 500, ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
      expect(JSON.stringify(error)).not.toContain('secret internals');
    });

    it('returns BAD_REQUEST for malformed JSON bodies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/test-errors/echo')
        .set('Content-Type', 'application/json')
        .send('{"broken":')
        .expect(400);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe(ErrorCode.BAD_REQUEST);
    });
  });
});
