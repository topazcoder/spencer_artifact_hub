import { Controller, Get } from '@nestjs/common';
import { ErrorCode } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { Public } from '../auth/auth.decorators.js';
import { AppError } from '../common/errors/app-error.js';

const DB_CHECK_TIMEOUT_MS = 2000;

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    @InjectPinoLogger(HealthController.name) private readonly logger: PinoLogger,
  ) {}

  @Get()
  async check() {
    try {
      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Database check timed out')),
            DB_CHECK_TIMEOUT_MS,
          ).unref(),
        ),
      ]);
    } catch (err) {
      this.logger.error({ err }, 'Health check failed: database unavailable');
      throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Database unavailable', {
        checks: { database: 'down' },
      });
    }
    return { status: 'ok', checks: { database: 'up' } };
  }
}
