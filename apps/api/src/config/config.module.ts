import { DynamicModule, Global, Inject, Module } from '@nestjs/common';
import type { Env } from './config.types.js';

export const ENV = Symbol('ENV');

/** Injects the validated environment (`Env`). */
export const InjectEnv = () => Inject(ENV);

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
