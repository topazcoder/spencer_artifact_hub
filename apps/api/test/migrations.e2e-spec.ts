import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source.options.js';
import { migrations } from '../src/database/migrations/index.js';
import { testEnv } from './test-env.js';

describe('migrations (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await new DataSource(buildDataSourceOptions(testEnv.DATABASE_URL)).initialize();
  });

  afterAll(async () => {
    // Leave the schema fully migrated for the other suites.
    await dataSource.runMigrations();
    await dataSource.destroy();
  });

  it('has no pending migrations after global setup', async () => {
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('every migration can be reverted and re-applied', async () => {
    for (let i = 0; i < migrations.length; i++) await dataSource.undoLastMigration();
    const reverted = await dataSource.query('SELECT count(*)::int AS n FROM migrations');
    expect(reverted[0].n).toBe(0);

    const applied = await dataSource.runMigrations();
    expect(applied).toHaveLength(migrations.length);
  });

  it('enables citext', async () => {
    const rows = await dataSource.query("SELECT 1 FROM pg_extension WHERE extname = 'citext'");
    expect(rows).toHaveLength(1);
  });
});
