import { parseEnv } from '../src/config/env.js';

/** The e2e suite runs against a real Postgres (`artifact_hub_test`, created by docker-compose). */
export const testEnv = parseEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://artifact_hub:artifact_hub@localhost:5432/artifact_hub_test',
});
