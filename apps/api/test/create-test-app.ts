import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/config.types.js';
import { testEnv } from './test-env.js';

/** Boots the real application (same module and HTTP setup as production) for supertest. */
export async function createTestApp(
  options: { controllers?: Type[]; env?: Partial<Env> } = {},
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ ...testEnv, ...options.env })],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
