import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { buildDataSourceOptions } from './data-source.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        ...buildDataSourceOptions(env.DATABASE_URL),
        autoLoadEntities: true,
        retryAttempts: 5,
        retryDelay: 2000,
      }),
    }),
  ],
})
export class DatabaseModule {}
