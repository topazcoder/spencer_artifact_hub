import { createHash, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactListResponseSchema,
  artifactResponseSchema,
  type CreateArtifactRequest,
  ErrorCode,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { ArtifactsService } from '../src/artifacts/artifacts.service.js';
import { STORAGE_DRIVER } from '../src/storage/storage.module.js';
import type { StorageDriver } from '../src/storage/storage.types.js';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN, testEnv } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

const METADATA: CreateArtifactRequest = {
  title: 'Pricing page',
  description: 'Draft of the new pricing page',
  tags: ['Marketing', 'Q3'],
};

function errorOf(res: Response) {
  return apiErrorBodySchema.parse(res.body).error;
}

/** Every blob file in the test store, to check failed uploads leave nothing behind. */
async function blobFiles(): Promise<string[]> {
  try {
    const entries = await readdir(testEnv.STORAGE_LOCAL_ROOT, {
      recursive: true,
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

describe('Artifacts (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'artifacts');
    [ada, bob] = await Promise.all([users.create('Ada'), users.create('Bob')]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function publish(user: TestUser, file: Buffer, filename: string, metadata: unknown = METADATA) {
    return http()
      .post('/api/artifacts')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .field('metadata', JSON.stringify(metadata))
      .attach('file', file, filename);
  }

  function get(user: TestUser, id: string) {
    return http().get(`/api/artifacts/${id}`).set('Cookie', user.cookie);
  }

  function list(user: TestUser, query: Record<string, string | number> = {}) {
    return http().get('/api/artifacts').query(query).set('Cookie', user.cookie);
  }

  async function listPage(user: TestUser, query: Record<string, number> = {}) {
    return artifactListResponseSchema.parse((await list(user, query).expect(200)).body);
  }

  describe('POST /api/artifacts', () => {
    it('publishes version 1 and returns the artifact', async () => {
      const res = await publish(ada, fixtures.html, 'pricing.html').expect(201);
      const { artifact } = artifactResponseSchema.parse(res.body);

      expect(artifact).toMatchObject({
        title: 'Pricing page',
        description: 'Draft of the new pricing page',
        tags: ['marketing', 'q3'],
        visibility: 'private',
        status: 'published',
        metadataSource: 'user',
        owner: { id: ada.id, displayName: 'Ada' },
        latestVersionNo: 1,
        currentVersion: {
          versionNo: 1,
          mimeType: 'text/html',
          sizeBytes: fixtures.html.length,
          sha256: createHash('sha256').update(fixtures.html).digest('hex'),
          originalFilename: 'pricing.html',
          changeNote: null,
        },
      });
    });

    it('stores the exact bytes under a server-generated key', async () => {
      const res = await publish(ada, fixtures.png, '../../evil name.png').expect(201);
      const { artifact } = artifactResponseSchema.parse(res.body);
      expect(artifact.currentVersion?.mimeType).toBe('image/png');
      expect(artifact.currentVersion?.originalFilename).toBe('evil name.png');

      const [row] = await app
        .get(DataSource)
        .query('SELECT storage_key FROM artifact_versions WHERE artifact_id = $1', [artifact.id]);
      expect(row.storage_key).toMatch(new RegExp(`^artifacts/${artifact.id}/1-[0-9a-f-]{36}$`));

      const storage = app.get<StorageDriver>(STORAGE_DRIVER);
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.getStream(row.storage_key)) chunks.push(chunk);
      expect(Buffer.concat(chunks).equals(fixtures.png)).toBe(true);
    });

    it.each([
      ['svg', 'logo.svg', 'image/svg+xml'],
      ['markdown', 'notes.md', 'text/markdown'],
      ['pdf', 'report', 'application/pdf'],
    ] as const)('detects %s content', async (fixture, filename, mimeType) => {
      const res = await publish(ada, fixtures[fixture], filename).expect(201);
      expect(artifactResponseSchema.parse(res.body).artifact.currentVersion?.mimeType).toBe(
        mimeType,
      );
    });

    it('rejects unsupported content and leaves no rows or blobs behind', async () => {
      const before = await blobFiles();
      const title = `Rejected ${randomUUID()}`;
      const res = await publish(ada, fixtures.zip, 'archive.png', { title }).expect(415);
      expect(errorOf(res).code).toBe(ErrorCode.UNSUPPORTED_TYPE);

      const rows = await app
        .get(DataSource)
        .query('SELECT 1 FROM artifacts WHERE title = $1', [title]);
      expect(rows).toHaveLength(0);
      expect(await blobFiles()).toEqual(before);
    });

    it('deletes the blob when the database transaction fails', async () => {
      const db = app.get(DataSource);
      const before = await blobFiles();
      const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('db down'));
      try {
        const res = await publish(ada, fixtures.svg, 'logo.svg').expect(500);
        expect(errorOf(res).code).toBe(ErrorCode.INTERNAL_ERROR);
      } finally {
        spy.mockRestore();
      }
      expect(await blobFiles()).toEqual(before);
    });

    it('validates the metadata', async () => {
      const res = await publish(ada, fixtures.html, 'a.html', {
        title: '  ',
        tags: ['a,b'],
      }).expect(400);
      const error = errorOf(res);
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'title' }),
          expect.objectContaining({ path: 'tags.0' }),
        ]),
      );
    });

    it('requires the metadata field before the file', async () => {
      const res = await http()
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .attach('file', fixtures.html, 'a.html')
        .field('metadata', JSON.stringify(METADATA))
        .expect(400);
      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        message: expect.stringContaining('"metadata" field before the file'),
      });
    });

    it('requires a file', async () => {
      const res = await http()
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .field('metadata', JSON.stringify(METADATA))
        .expect(400);
      expect(errorOf(res).code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('rejects a JSON body', async () => {
      const res = await http()
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .send(METADATA)
        .expect(400);
      expect(errorOf(res).code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('requires a session and a same-origin request', async () => {
      await http()
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .field('metadata', JSON.stringify(METADATA))
        .attach('file', fixtures.html, 'a.html')
        .expect(401);
      await http()
        .post('/api/artifacts')
        .set('Origin', 'https://evil.example')
        .set('Cookie', ada.cookie)
        .field('metadata', JSON.stringify(METADATA))
        .attach('file', fixtures.html, 'a.html')
        .expect(403);
    });
  });

  describe('size limit', () => {
    const MAX = 2048;
    let small: NestExpressApplication;
    let smallUsers: ReturnType<typeof testUsers>;
    let user: TestUser;

    beforeAll(async () => {
      small = await createTestApp({ env: { MAX_ARTIFACT_BYTES: MAX } });
      smallUsers = testUsers(small, 'artifacts-limit');
      user = await smallUsers.create();
    });

    afterAll(async () => {
      await smallUsers.cleanup();
      await small.close();
    });

    function publishTo(file: Buffer) {
      return request(small.getHttpServer())
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', user.cookie)
        .field('metadata', JSON.stringify(METADATA))
        .attach('file', file, 'big.md');
    }

    it('accepts a file of exactly the limit', async () => {
      const file = Buffer.concat([Buffer.from('# '), Buffer.alloc(MAX - 2, 'a')]);
      await publishTo(file).expect(201);
    });

    it('rejects a file over the limit while it streams in', async () => {
      const before = await blobFiles();
      const res = await publishTo(Buffer.alloc(MAX * 4, 'a')).expect(413);
      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.ARTIFACT_TOO_LARGE,
        message: 'The file is larger than the 2 KB limit.',
        details: { maxBytes: MAX },
      });
      expect(await blobFiles()).toEqual(before);
    });

    it('rejects a request whose Content-Length is over the limit before reading it', async () => {
      const res = await publishTo(Buffer.alloc(200 * 1024, 'a')).expect(413);
      expect(errorOf(res).code).toBe(ErrorCode.ARTIFACT_TOO_LARGE);
    });
  });

  describe('GET /api/artifacts/:id', () => {
    let artifactId: string;

    beforeAll(async () => {
      const res = await publish(ada, fixtures.markdown, 'notes.md').expect(201);
      artifactId = artifactResponseSchema.parse(res.body).artifact.id;
    });

    it('returns the artifact to its owner', async () => {
      const res = await get(ada, artifactId).expect(200);
      expect(artifactResponseSchema.parse(res.body).artifact).toMatchObject({
        id: artifactId,
        currentVersion: { versionNo: 1, mimeType: 'text/markdown' },
      });
    });

    it('answers 404 to other users, exactly as for a missing artifact', async () => {
      const denied = await get(bob, artifactId).expect(404);
      const missing = await get(bob, randomUUID()).expect(404);
      expect(errorOf(denied).message).toBe(errorOf(missing).message);
    });

    it('answers 404 for malformed ids', async () => {
      expect(errorOf(await get(ada, 'not-a-uuid').expect(404)).code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('GET /api/artifacts (mine)', () => {
    let carol: TestUser;
    const titles = ['First', 'Second', 'Third'];

    beforeAll(async () => {
      carol = await users.create('Carol');
      for (const title of titles) {
        await publish(carol, fixtures.markdown, 'a.md', { title }).expect(201);
      }
    });

    it('pages through my artifacts, newest first, with the total', async () => {
      const first = await listPage(carol, { pageSize: 2 });
      expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
      expect(first.items.map((item) => item.title)).toEqual(['Third', 'Second']);

      const second = await listPage(carol, { page: 2, pageSize: 2 });
      expect(second).toMatchObject({ page: 2, pageSize: 2, total: 3 });
      expect(second.items.map((item) => item.title)).toEqual(['First']);
    });

    it('returns an empty page past the end, still with the total', async () => {
      const page = await listPage(carol, { page: 5, pageSize: 2 });
      expect(page).toMatchObject({ items: [], page: 5, total: 3 });
    });

    it('defaults to the first page of 24', async () => {
      expect(await listPage(carol)).toMatchObject({ page: 1, pageSize: 24, total: 3 });
    });

    it("never includes other users' artifacts", async () => {
      const page = artifactListResponseSchema.parse((await list(bob).expect(200)).body);
      expect(page.items).toEqual([]);
    });

    it("returns nothing when filtering by another user's id", async () => {
      const service = app.get(ArtifactsService);
      const asCarol = await service.list(
        { userId: carol.id, via: 'web' },
        { page: 1, pageSize: 10 },
      );
      expect(asCarol.items).toHaveLength(titles.length);

      const asBob = await service.list(
        { userId: bob.id, via: 'web' },
        { ownerId: carol.id, page: 1, pageSize: 10 },
      );
      expect(asBob).toEqual({ items: [], total: 0 });
    });

    it.each([
      { page: 0 },
      { page: 1001 },
      { page: 'two' },
      { pageSize: 0 },
      { pageSize: 51 },
    ] as Record<string, string | number>[])('rejects %j', async (query) => {
      expect(errorOf(await list(carol, query).expect(400)).code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });
});
