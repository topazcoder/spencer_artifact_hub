import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactResponseSchema,
  commentResponseSchema,
  ErrorCode,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import type { Actor } from '../src/auth/auth.types.js';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service.js';
import type { IdempotentResult } from '../src/common/idempotency/idempotency.types.js';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

const METADATA = { title: 'Pricing page', description: 'Three plans', tags: ['pricing'] };

const errorOf = (res: Response) => apiErrorBodySchema.parse(res.body).error;
const replayed = (res: Response) => res.headers[IDEMPOTENT_REPLAYED_HEADER.toLowerCase()];

describe('Idempotency-Key (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'idempotency');
    [ada, bob] = await Promise.all([users.create('Ada'), users.create('Bob')]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function post(user: TestUser, path: string, key?: string) {
    const req = http().post(`/api${path}`).set('Origin', TEST_ORIGIN).set('Cookie', user.cookie);
    return key === undefined ? req : req.set(IDEMPOTENCY_KEY_HEADER, key);
  }

  function publish(
    user: TestUser,
    key: string | undefined,
    { file = fixtures.markdown, filename = 'notes.md', metadata = METADATA as object } = {},
  ) {
    return post(user, '/artifacts', key)
      .field('metadata', JSON.stringify(metadata))
      .attach('file', file, filename);
  }

  async function artifactCount(user: TestUser): Promise<number> {
    const rows = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS n FROM artifacts WHERE owner_id = $1', [user.id]);
    return rows[0].n;
  }

  async function publishedId(user: TestUser): Promise<string> {
    const res = await publish(user, undefined).expect(201);
    return artifactResponseSchema.parse(res.body).artifact.id;
  }

  describe('publishing', () => {
    it('publishes once, and answers a repeat with the same artifact', async () => {
      const key = randomUUID();
      const before = await artifactCount(ada);
      const first = await publish(ada, key).expect(201);
      expect(replayed(first)).toBeUndefined();

      const again = await publish(ada, key).expect(201);
      expect(replayed(again)).toBe('true');
      expect(artifactResponseSchema.parse(again.body).artifact).toEqual(
        artifactResponseSchema.parse(first.body).artifact,
      );
      expect(await artifactCount(ada)).toBe(before + 1);
    });

    it('answers a repeat with the artifact as it is now', async () => {
      const key = randomUUID();
      const { id } = artifactResponseSchema.parse(
        (await publish(ada, key).expect(201)).body,
      ).artifact;
      await http()
        .patch(`/api/artifacts/${id}`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .send({ title: 'Renamed' })
        .expect(200);
      const again = await publish(ada, key).expect(201);
      expect(again.body.artifact).toMatchObject({ id, title: 'Renamed' });

      await http()
        .delete(`/api/artifacts/${id}`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .expect(204);
      await publish(ada, key).expect(404);
    });

    it('refuses the same key with other metadata or another filename', async () => {
      const key = randomUUID();
      await publish(ada, key).expect(201);
      const before = await artifactCount(ada);

      const otherTitle = await publish(ada, key, { metadata: { ...METADATA, title: 'Other' } });
      expect(otherTitle.status).toBe(409);
      expect(errorOf(otherTitle)).toMatchObject({
        code: ErrorCode.CONFLICT,
        message: `This ${IDEMPOTENCY_KEY_HEADER} was already used for a different request.`,
      });
      await publish(ada, key, { filename: 'other.md' }).expect(409);
      expect(await artifactCount(ada)).toBe(before);
    });

    it('treats the metadata the same however its fields are ordered', async () => {
      const key = randomUUID();
      await publish(ada, key).expect(201);
      const reordered = {
        tags: METADATA.tags,
        description: METADATA.description,
        title: 'Pricing page',
      };
      const again = await publish(ada, key, { metadata: reordered }).expect(201);
      expect(replayed(again)).toBe('true');
    });

    it('lets a key be used again after its request failed', async () => {
      const key = randomUUID();
      await publish(ada, key, { file: fixtures.zip, filename: 'archive.zip' }).expect(415);
      const res = await publish(ada, key).expect(201);
      expect(replayed(res)).toBeUndefined();
    });

    it('keeps keys per user', async () => {
      const key = randomUUID();
      const byAda = await publish(ada, key).expect(201);
      const byBob = await publish(bob, key).expect(201);
      expect(replayed(byBob)).toBeUndefined();
      expect(byBob.body.artifact.id).not.toBe(byAda.body.artifact.id);
    });

    it('refuses a key used on another route', async () => {
      const key = randomUUID();
      const id = await publishedId(ada);
      await post(ada, `/artifacts/${id}/comments`, key).send({ body: 'First' }).expect(201);
      const res = await publish(ada, key);
      expect(res.status).toBe(409);
      expect(errorOf(res).message).toMatch(/different request/);
    });

    it('refuses a key that is not a UUID', async () => {
      const before = await artifactCount(ada);
      const res = await publish(ada, 'not-a-uuid').expect(400);
      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        message: `${IDEMPOTENCY_KEY_HEADER} must be a UUID.`,
      });
      expect(await artifactCount(ada)).toBe(before);
    });

    it('works without a key, publishing every time', async () => {
      const before = await artifactCount(ada);
      await publish(ada, undefined).expect(201);
      await publish(ada, undefined).expect(201);
      expect(await artifactCount(ada)).toBe(before + 2);
    });

    it('forgets keys after a day', async () => {
      const key = randomUUID();
      const first = await publish(ada, key).expect(201);
      await app.get(DataSource).query(
        `UPDATE idempotency_keys SET created_at = now() - interval '25 hours'
           WHERE user_id = $1 AND key = $2`,
        [ada.id, key],
      );
      const again = await publish(ada, key, { metadata: { ...METADATA, title: 'Later' } });
      expect(again.status).toBe(201);
      expect(replayed(again)).toBeUndefined();
      expect(again.body.artifact.id).not.toBe(first.body.artifact.id);
    });
  });

  describe('new versions', () => {
    it('adds one version, and refuses other details with the same key', async () => {
      const id = await publishedId(ada);
      const key = randomUUID();
      const send = (changeNote: string) =>
        post(ada, `/artifacts/${id}/versions`, key)
          .field('metadata', JSON.stringify({ changeNote }))
          .attach('file', fixtures.markdown, 'notes.md');

      await send('Round 2').expect(201);
      const again = await send('Round 2').expect(201);
      expect(replayed(again)).toBe('true');
      expect(again.body.artifact).toMatchObject({ latestVersionNo: 2 });
      await send('Round 3').expect(409);

      const versions = await http().get(`/api/artifacts/${id}/versions`).set('Cookie', ada.cookie);
      expect(versions.body.items).toHaveLength(2);
    });
  });

  describe('comments', () => {
    it('posts once, and answers a repeat with the same comment', async () => {
      const id = await publishedId(ada);
      const key = randomUUID();
      const first = await post(ada, `/artifacts/${id}/comments`, key)
        .send({ body: 'Looks good' })
        .expect(201);
      const again = await post(ada, `/artifacts/${id}/comments`, key)
        .send({ body: 'Looks good' })
        .expect(201);
      expect(replayed(again)).toBe('true');
      expect(commentResponseSchema.parse(again.body).comment.id).toBe(
        commentResponseSchema.parse(first.body).comment.id,
      );
      await post(ada, `/artifacts/${id}/comments`, key).send({ body: 'Other' }).expect(409);

      const threads = await http().get(`/api/artifacts/${id}/comments`).set('Cookie', ada.cookie);
      expect(threads.body.items).toHaveLength(1);
    });
  });

  describe('a repeat while the first request is still running', () => {
    it('is refused, and the first finishes normally', async () => {
      const service = app.get(IdempotencyService);
      const actor: Actor = { userId: ada.id, via: 'web' };
      const key = randomUUID();
      const req = {
        method: 'POST',
        originalUrl: '/api/test',
        get: (name: string) => (name === IDEMPOTENCY_KEY_HEADER ? key : undefined),
      } as never;

      let finish!: () => void;
      const running = service.run(req, actor, {
        execute: () =>
          new Promise<IdempotentResult<string>>((resolve) => {
            finish = () => resolve({ result: 'first', resourceId: randomUUID() });
          }),
        replay: async () => 'replayed',
        fingerprint: 'a'.repeat(64),
      });
      // Let the first claim the key.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const repeat = service.run(req, actor, {
        execute: async () => ({ result: 'second', resourceId: randomUUID() }),
        replay: async () => 'replayed',
        fingerprint: 'a'.repeat(64),
      });
      await expect(repeat).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: expect.stringMatching(/still being processed/),
      });

      finish();
      await expect(running).resolves.toBe('first');
    });
  });
});
