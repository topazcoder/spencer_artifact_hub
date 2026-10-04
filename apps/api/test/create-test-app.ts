import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import type { Env } from '../src/config/config.types.js';
import { testEnv } from './test-env.js';

/** A provider to replace, e.g. `AI_PROVIDER` with a fake. */
interface ProviderOverride {
  provide: string | symbol | Type;
  useValue: unknown;
}

/** Boots the real application (same module and HTTP setup as production) for supertest. */
export async function createTestApp(
  options: { controllers?: Type[]; env?: Partial<Env>; overrides?: ProviderOverride[] } = {},
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule.register({ ...testEnv, ...options.env })],
    controllers: options.controllers ?? [],
  });
  for (const { provide, useValue } of options.overrides ?? []) {
    builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
