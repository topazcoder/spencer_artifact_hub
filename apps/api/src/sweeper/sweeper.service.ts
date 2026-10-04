import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ArtifactsService, UNUSED_BLOB_GRACE_MINUTES } from '../artifacts/artifacts.service.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { InjectStorage } from '../storage/storage.module.js';
import type { StorageDriver } from '../storage/storage.types.js';
import { UploadSessionsService } from '../uploads/sessions/upload-sessions.service.js';
import type { SweepReport, SweepTask } from './sweeper.types.js';

/** The first sweep runs this soon after boot, so frequent redeploys don't keep putting it off. */
const FIRST_SWEEP_DELAY_MS = 60_000;

/**
 * Removes what the app leaves behind (plan §10), every `SWEEP_INTERVAL_MINUTES`. What counts
 * as a leftover is decided by the module that owns it; this only runs their cleanups. The next
 * sweep is scheduled when one ends, so two never overlap (one replica).
 */
@Injectable()
export class SweeperService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly tasks: SweepTask[];

  constructor(
    artifacts: ArtifactsService,
    uploadSessions: UploadSessionsService,
    idempotency: IdempotencyService,
    @InjectStorage() storage: StorageDriver,
    @InjectEnv() private readonly env: Env,
    @InjectPinoLogger(SweeperService.name) private readonly logger: PinoLogger,
  ) {
    this.tasks = [
      { name: 'unusedBlobs', run: () => artifacts.deleteUnusedBlobs() },
      {
        name: 'incompleteWrites',
        run: () =>
          storage.deleteIncompleteWrites(new Date(Date.now() - UNUSED_BLOB_GRACE_MINUTES * 60_000)),
      },
      { name: 'abandonedDrafts', run: () => artifacts.deleteAbandonedDrafts() },
      { name: 'expiredUploadSessions', run: () => uploadSessions.deleteExpired() },
      { name: 'expiredIdempotencyKeys', run: () => idempotency.deleteExpired() },
    ];
  }

  onApplicationBootstrap(): void {
    if (this.env.SWEEP_INTERVAL_MINUTES > 0) this.schedule(FIRST_SWEEP_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Runs every task once. A failing task is logged and the others still run. Returns what
   * each removed.
   */
  async sweep(): Promise<SweepReport> {
    const started = performance.now();
    const report: SweepReport = {};
    for (const task of this.tasks) {
      try {
        report[task.name] = await task.run();
      } catch (err) {
        report[task.name] = null;
        this.logger.error({ err, task: task.name }, 'Sweep task failed');
      }
    }
    this.logger.info({ ...report, ms: Math.round(performance.now() - started) }, 'Sweep done');
    return report;
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.sweep().finally(() => {
        // Not if the app shut down during the sweep.
        if (this.timer) this.schedule(this.env.SWEEP_INTERVAL_MINUTES * 60_000);
      });
    }, delayMs);
    // Never keeps the process alive on its own.
    this.timer.unref();
  }
}
