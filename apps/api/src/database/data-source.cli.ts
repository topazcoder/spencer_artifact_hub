import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { parseEnv } from '../config/env.js';
import { buildDataSourceOptions } from './data-source.options.js';

if (existsSync('.env')) process.loadEnvFile('.env');

/** Data source for the TypeORM CLI (`migration:generate`, `migration:revert`), run against `dist/`. */
export default new DataSource({
  ...buildDataSourceOptions(parseEnv(process.env).DATABASE_URL),
  entities: [`${import.meta.dirname}/../**/*.entity.js`],
});
