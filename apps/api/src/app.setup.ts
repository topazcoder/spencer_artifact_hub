import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

/** HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise the real app. */
export function configureApp(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api', { exclude: ['mcp'] });
  app.enableShutdownHooks();
}
