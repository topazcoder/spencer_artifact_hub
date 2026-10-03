import { Readable } from 'node:stream';
import { Controller, Get } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.decorators.js';
import { AppError } from '../common/errors/app-error.js';
import { blobKeys } from '../storage/blob-keys.js';
import { InjectStorage } from '../storage/storage.module.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { HealthChecks, HealthStatus } from './health.types.js';

const CHECK_TIMEOUT_MS = 2000;

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectStorage() private readonly storage: StorageDriver,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  async check() {
    const [database, storage] = await Promise.all([
      this.probe('database', () => this.dataSource.query('SELECT 1')),
      this.probe('storage', () => this.probeStorage()),
    ]);
    const checks: HealthChecks = { database, storage };
    if (database === 'down' || storage === 'down') {
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Service unavailable', { checks });
    }
    return { status: 'ok', checks };
  }

  /** Writes and deletes a tiny blob, so a read-only or full volume is reported. */
  private async probeStorage(): Promise<void> {
    const key = blobKeys.healthProbe();
    try {
      await this.storage.put(key, Readable.from([Buffer.from('ok')]), {
        contentType: 'text/plain',
      });
    } finally {
      await this.storage.delete(key);
    }
  }

  private async probe(name: string, check: () => Promise<unknown>): Promise<HealthStatus> {
    try {
      await Promise.race([
        check(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${name} check timed out`)), CHECK_TIMEOUT_MS).unref(),
        ),
      ]);
      return 'up';
    } catch (err) {
      this.logger.error({ err, check: name }, `Health check failed: ${name} unavailable`);
      return 'down';
    }
  }
}
