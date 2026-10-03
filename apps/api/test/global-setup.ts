import { runMigrations } from '../src/database/migrate.js';
import { testEnv } from './test-env.js';

/** Brings the e2e database schema up to date once before the suite runs. */
export default async function setup() {
  await runMigrations(testEnv.DATABASE_URL);
}
