import { randomUUID } from 'node:crypto';
import { mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { artifactResponseSchema } from '@artifact-hub/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ArtifactsService } from '../src/artifacts/artifacts.service.js';
import type { Actor } from '../src/auth/auth.types.js';
import { STORAGE_DRIVER } from '../src/storage/storage.module.js';
import type { StorageDriver } from '../src/storage/storage.types.js';
import { SweeperService } from '../src/sweeper/sweeper.service.js';
import { UploadSessionsService } from '../src/uploads/sessions/upload-sessions.service.js';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN, testEnv } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

const METADATA = {
  title: 'Report',
  description: 'Quarterly numbers',
  tags: ['finance'],
  visibility: 'private' as const,
};

/** Sets a file's modification time `hours` back, as if it had been written then. */
async function backdateFile(relative: string, hours: number): Promise<void> {
  const then = new Date(Date.now() - hours * 3600_000);
  await utimes(path.join(testEnv.STORAGE_LOCAL_ROOT, relative), then, then);
}

async function fileExists(relative: string): Promise<boolean> {
  return stat(path.join(testEnv.STORAGE_LOCAL_ROOT, relative)).then(
    () => true,
    () => false,
  );
}

describe('Sweeper (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let actor: Actor;
  let db: DataSource;
  let storage: StorageDriver;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'sweeper');
    ada = await users.create('Ada');
    actor = { userId: ada.id, via: 'mcp' };
    db = app.get(DataSource);
    storage = app.get<StorageDriver>(STORAGE_DRIVER);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const sweep = () => app.get(SweeperService).sweep();

  async function exists(key: string): Promise<boolean> {
    return (await storage.stat(key)) !== null;
  }

  async function artifactExists(id: string): Promise<boolean> {
    const rows = await db.query('SELECT 1 FROM artifacts WHERE id = $1', [id]);
    return rows.length > 0;
  }

  /** A draft of Ada's, as an MCP publish without content makes, created `hours` ago. */
  async function draft(hours: number): Promise<string> {
    const { artifact } = await app.get(ArtifactsService).createDraft(actor, METADATA);
    await db.query(
      `UPDATE artifacts SET created_at = now() - make_interval(hours => $2) WHERE id = $1`,
      [artifact.id, hours],
    );
    return artifact.id;
  }

  describe('blobs', () => {
    it('deletes old blobs no version points to, and keeps used and recent ones', async () => {
      const unused = `artifacts/${randomUUID()}/1-${randomUUID()}`;
      const recent = `artifacts/${randomUUID()}/1-${randomUUID()}`;
      await storage.put(unused, Readable.from([Buffer.from('orphan')]), { contentType: 'x' });
      await storage.put(recent, Readable.from([Buffer.from('mid-publish')]), { contentType: 'x' });
      await backdateFile(unused, 2);

      const res = await request(app.getHttpServer())
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .field('metadata', JSON.stringify(METADATA))
        .attach('file', fixtures.markdown, 'notes.md')
        .expect(201);
      const { id } = artifactResponseSchema.parse(res.body).artifact;
      const [{ storage_key: used }] = await db.query(
        'SELECT storage_key FROM artifact_versions WHERE artifact_id = $1',
        [id],
      );
      await backdateFile(used, 2);

      const report = await sweep();
      expect(report.unusedBlobs).toBeGreaterThanOrEqual(1);
      expect(await exists(unused)).toBe(false);
      expect(await exists(recent)).toBe(true);
      expect(await exists(used)).toBe(true);
      await storage.delete(recent);
    });

    it('deletes old temporary files of writes cut short, and keeps recent ones', async () => {
      const dir = `artifacts/${randomUUID()}`;
      await mkdir(path.join(testEnv.STORAGE_LOCAL_ROOT, dir), { recursive: true });
      const crashed = `${dir}/1-x.${randomUUID()}.tmp`;
      const writing = `${dir}/2-y.${randomUUID()}.tmp`;
      await writeFile(path.join(testEnv.STORAGE_LOCAL_ROOT, crashed), 'partial');
      await writeFile(path.join(testEnv.STORAGE_LOCAL_ROOT, writing), 'partial');
      await backdateFile(crashed, 2);

      const report = await sweep();
      expect(report.incompleteWrites).toBeGreaterThanOrEqual(1);
      expect(await fileExists(crashed)).toBe(false);
      expect(await fileExists(writing)).toBe(true);
    });
  });

  describe('drafts', () => {
    it('deletes drafts never uploaded after a day, with their upload sessions', async () => {
      const abandoned = await draft(25);
      const expiredLink = await draft(25);
      const { session } = await app.get(UploadSessionsService).issue(actor, expiredLink);
      await db.query(
        `UPDATE upload_sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`,
        [session.id],
      );

      await sweep();
      expect(await artifactExists(abandoned)).toBe(false);
      expect(await artifactExists(expiredLink)).toBe(false);
      const sessions = await db.query('SELECT 1 FROM upload_sessions WHERE id = $1', [session.id]);
      expect(sessions).toHaveLength(0);
    });

    it('keeps recent drafts, drafts with an open upload link, and published artifacts', async () => {
      const recent = await draft(1);
      const waiting = await draft(25);
      await app.get(UploadSessionsService).issue(actor, waiting);
      const published = await app.get(ArtifactsService).create(actor, METADATA, {
        stream: Readable.from([fixtures.markdown]),
        textFormat: 'markdown',
      });
      await db.query(
        `UPDATE artifacts SET created_at = now() - interval '25 hours' WHERE id = $1`,
        [published.artifact.id],
      );

      await sweep();
      expect(await artifactExists(recent)).toBe(true);
      expect(await artifactExists(waiting)).toBe(true);
      expect(await artifactExists(published.artifact.id)).toBe(true);
    });
  });

  describe('upload sessions', () => {
    it('deletes sessions a day after they expired, and keeps the others', async () => {
      const artifactId = await draft(0);
      const issue = () => app.get(UploadSessionsService).issue(actor, artifactId);
      const [longExpired, justExpired, open] = await Promise.all([issue(), issue(), issue()]);
      await db.query(
        `UPDATE upload_sessions SET expires_at = now() - interval '25 hours' WHERE id = $1`,
        [longExpired.session.id],
      );
      await db.query(
        `UPDATE upload_sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`,
        [justExpired.session.id],
      );

      const report = await sweep();
      expect(report.expiredUploadSessions).toBeGreaterThanOrEqual(1);
      const left = await db.query(
        'SELECT id FROM upload_sessions WHERE artifact_id = $1 ORDER BY id',
        [artifactId],
      );
      expect(left.map((row: { id: string }) => row.id).toSorted()).toEqual(
        [justExpired.session.id, open.session.id].toSorted(),
      );
    });
  });

  describe('idempotency keys', () => {
    it('deletes keys older than a day', async () => {
      const [old, recent] = [randomUUID(), randomUUID()];
      await db.query(
        `INSERT INTO idempotency_keys (user_id, key, route, created_at)
         VALUES ($1, $2, 'POST /api/artifacts', now() - interval '25 hours'),
                ($1, $3, 'POST /api/artifacts', now())`,
        [ada.id, old, recent],
      );

      const report = await sweep();
      expect(report.expiredIdempotencyKeys).toBeGreaterThanOrEqual(1);
      const left = await db.query('SELECT key FROM idempotency_keys WHERE user_id = $1', [ada.id]);
      expect(left).toEqual([{ key: recent }]);
    });
  });
});
