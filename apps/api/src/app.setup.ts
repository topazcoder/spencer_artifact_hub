import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
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
  // MCP clients send text artifacts inline as JSON strings, which escaping can make up to about
  // twice as long. Everything else keeps Nest's default 100 kB parser, added at init, which
  // skips bodies already parsed here. The upload pipeline still enforces MAX_ARTIFACT_BYTES.
  // Wrapped in a named function: Nest leaves out its own parser if a layer is named `jsonParser`.
  const mcpJson = json({ limit: env.MAX_ARTIFACT_BYTES * 2 + 64 * 1024 });
  app.use('/mcp', function mcpJsonParser(req: Request, res: Response, next: NextFunction) {
    mcpJson(req, res, next);
  });
  app.setGlobalPrefix('api', { exclude: ['mcp'] });
  app.enableShutdownHooks();
}
