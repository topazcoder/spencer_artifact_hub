import type { DataSourceOptions } from 'typeorm';
import { migrations } from './migrations/index.js';
import { SnakeNamingStrategy } from './snake-naming.strategy.js';

/** Options shared by the Nest app, the migration runner and the TypeORM CLI. */
export function buildDataSourceOptions(databaseUrl: string) {
  return {
    type: 'postgres',
    url: databaseUrl,
    // The schema is only ever changed by migrations.
    synchronize: false,
    migrationsRun: false,
    migrations,
    migrationsTableName: 'migrations',
    migrationsTransactionMode: 'each',
    namingStrategy: new SnakeNamingStrategy(),
    applicationName: 'artifact-hub',
  } satisfies DataSourceOptions;
}
