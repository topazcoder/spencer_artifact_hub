import { ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import type { DataSource } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import type { StorageDriver } from '../storage/storage.types.js';
import { HealthController } from './health.controller.js';

const logger = { error: vi.fn() } as unknown as PinoLogger;

function storageWith(put: () => Promise<unknown>) {
  return { put, delete: vi.fn(async () => undefined) } as unknown as StorageDriver;
}

const healthyStorage = () => storageWith(async () => ({ size: 2, sha256: '' }));
const healthyDb = async () => [{ '?column?': 1 }];

function controllerWith(query: () => Promise<unknown>, storage: StorageDriver) {
  return new HealthController({ query } as unknown as DataSource, storage, logger);
}

describe('HealthController', () => {
  it('reports ok when the database answers and storage is writable', async () => {
    const storage = healthyStorage();
    await expect(controllerWith(healthyDb, storage).check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', storage: 'up' },
    });
    expect(storage.delete).toHaveBeenCalledOnce();
  });

  it('throws SERVICE_UNAVAILABLE when the database query fails', async () => {
    const check = controllerWith(
      () => Promise.reject(new Error('ECONNREFUSED')),
      healthyStorage(),
    ).check();
    await expect(check).rejects.toBeInstanceOf(AppError);
    await expect(check).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      details: { checks: { database: 'down', storage: 'up' } },
    });
  });

  it('throws SERVICE_UNAVAILABLE when storage is not writable, and cleans up the probe', async () => {
    const storage = storageWith(() => Promise.reject(new Error('EROFS')));
    const check = controllerWith(healthyDb, storage).check();
    await expect(check).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      details: { checks: { database: 'up', storage: 'down' } },
    });
    expect(storage.delete).toHaveBeenCalledOnce();
  });
});
