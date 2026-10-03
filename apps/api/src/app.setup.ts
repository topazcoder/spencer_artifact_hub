import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/config.types.js';

/** HTTP-level setup shared by `main.ts` and the e2e tests, so tests exercise the real app. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));
  // Behind a reverse proxy, take the client IP from X-Forwarded-For (rate limits, sessions).
  app.set('trust proxy', env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false);
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['mcp'] });
  app.enableShutdownHooks();
}
