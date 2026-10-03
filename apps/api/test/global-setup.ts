import { rm } from 'node:fs/promises';
import { runMigrations } from '../src/database/migrate.js';
import { testEnv } from './test-env.js';

/** Brings the e2e database schema up to date and empties the test blob store before the suite runs. */
export default async function setup() {
  await runMigrations(testEnv.DATABASE_URL);
  await rm(testEnv.STORAGE_LOCAL_ROOT, { recursive: true, force: true });
}
