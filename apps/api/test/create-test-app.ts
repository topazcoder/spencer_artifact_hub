import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { testEnv } from './test-env.js';

/** Boots the real application (same module and HTTP setup as production) for supertest. */
export async function createTestApp(
  options: { controllers?: Type[] } = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(testEnv)],
    controllers: options.controllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
