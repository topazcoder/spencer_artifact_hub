import { ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import type { DataSource } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import { HealthController } from './health.controller.js';

const logger = { error: vi.fn() } as unknown as PinoLogger;

function controllerWith(query: () => Promise<unknown>) {
  return new HealthController({ query } as unknown as DataSource, logger);
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    await expect(controllerWith(async () => [{ '?column?': 1 }]).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('throws SERVICE_UNAVAILABLE when the database query fails', async () => {
    const check = controllerWith(() => Promise.reject(new Error('ECONNREFUSED'))).check();
    await expect(check).rejects.toBeInstanceOf(AppError);
    await expect(check).rejects.toMatchObject({ code: ErrorCode.SERVICE_UNAVAILABLE });
  });
});
