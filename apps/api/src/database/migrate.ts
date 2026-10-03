import 'reflect-metadata';
import { existsSync } from 'node:fs';
import pino from 'pino';
import { DataSource } from 'typeorm';
import { parseEnv } from '../config/env.js';
import { buildDataSourceOptions } from './data-source.options.js';

/** Applies pending migrations. Run before the server starts (`pnpm db:migrate`, Docker CMD). */
export async function runMigrations(databaseUrl: string): Promise<string[]> {
  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    return applied.map((migration) => migration.name);
  } finally {
    await dataSource.destroy();
  }
}

if (import.meta.main) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = parseEnv(process.env);
  const logger = pino({ level: env.LOG_LEVEL, base: { context: 'Migrations' } });
  try {
    const applied = await runMigrations(env.DATABASE_URL);
    logger.info({ applied }, applied.length ? 'Migrations applied' : 'No pending migrations');
  } catch (err) {
    logger.error({ err }, 'Migrations failed');
    process.exitCode = 1;
  }
}
