import type { PinoLogger } from 'nestjs-pino';
import type { ArtifactsService } from '../artifacts/artifacts.service.js';
import type { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import type { Env } from '../config/config.types.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { UploadSessionsService } from '../uploads/sessions/upload-sessions.service.js';
import { SweeperService } from './sweeper.service.js';

function setup({ interval = 60, failBlobs = false } = {}) {
  const artifacts = {
    deleteUnusedBlobs: vi.fn(async () => {
      if (failBlobs) throw new Error('storage unavailable');
      return 2;
    }),
    deleteAbandonedDrafts: vi.fn(async () => 1),
  };
  const uploadSessions = { deleteExpired: vi.fn(async () => 3) };
  const idempotency = { deleteExpired: vi.fn(async () => 4) };
  const storage = { deleteIncompleteWrites: vi.fn(async () => 0) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const sweeper = new SweeperService(
    artifacts as unknown as ArtifactsService,
    uploadSessions as unknown as UploadSessionsService,
    idempotency as unknown as IdempotencyService,
    storage as unknown as StorageDriver,
    { SWEEP_INTERVAL_MINUTES: interval } as Env,
    logger as unknown as PinoLogger,
  );
  return { sweeper, artifacts, storage, logger };
}

describe('SweeperService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs every cleanup and reports what each removed', async () => {
    const { sweeper, storage, logger } = setup();
    expect(await sweeper.sweep()).toEqual({
      unusedBlobs: 2,
      incompleteWrites: 0,
      abandonedDrafts: 1,
      expiredUploadSessions: 3,
      expiredIdempotencyKeys: 4,
    });
    // Temporary files as old as the unused blobs' grace period.
    const [olderThan] = storage.deleteIncompleteWrites.mock.calls[0] as unknown as [Date];
    expect(Date.now() - olderThan.getTime()).toBeGreaterThanOrEqual(60 * 60_000);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ unusedBlobs: 2, expiredIdempotencyKeys: 4 }),
      'Sweep done',
    );
  });

  it('runs the other cleanups when one fails, and logs it', async () => {
    const { sweeper, artifacts, logger } = setup({ failBlobs: true });
    const report = await sweeper.sweep();
    expect(report).toMatchObject({ unusedBlobs: null, abandonedDrafts: 1 });
    expect(artifacts.deleteAbandonedDrafts).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'unusedBlobs' }),
      'Sweep task failed',
    );
  });

  it('sweeps a minute after boot, then every interval, until shut down', async () => {
    vi.useFakeTimers();
    const { sweeper, artifacts } = setup({ interval: 60 });
    sweeper.onApplicationBootstrap();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(artifacts.deleteAbandonedDrafts).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(artifacts.deleteAbandonedDrafts).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(artifacts.deleteAbandonedDrafts).toHaveBeenCalledTimes(2);

    sweeper.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);
    expect(artifacts.deleteAbandonedDrafts).toHaveBeenCalledTimes(2);
  });

  it('never sweeps on its own when the interval is 0', async () => {
    vi.useFakeTimers();
    const { sweeper, artifacts } = setup({ interval: 0 });
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(artifacts.deleteAbandonedDrafts).not.toHaveBeenCalled();
  });
});
