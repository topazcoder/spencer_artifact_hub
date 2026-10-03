import { parseEnv } from '../src/config/env.js';

/** The e2e suite runs against a real Postgres (`artifact_hub_test`, created by docker-compose). */
export const testEnv = parseEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgres://artifact_hub:artifact_hub@localhost:5432/artifact_hub_test',
  // High enough that suites logging in repeatedly never hit them; the rate-limit test lowers them.
  RATE_LIMIT_LOGIN_PER_IP: '1000',
  RATE_LIMIT_LOGIN_PER_EMAIL: '1000',
  // Kept apart from the development blobs in .data/blobs.
  STORAGE_LOCAL_ROOT: '.data/test-blobs',
});

/** The `Origin` the test app accepts for state-changing requests. */
export const TEST_ORIGIN = testEnv.APP_BASE_URL;
