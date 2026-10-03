import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactAccessResponseSchema,
  artifactResponseSchema,
  ErrorCode,
  sharedArtifactResponseSchema,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { CONTENT_SECURITY_POLICY } from '../src/artifacts/content/content-headers.js';
import { hashSecretToken } from '../src/common/tokens/secret-tokens.js';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

const DAY = 24 * 60 * 60_000;

function errorOf(res: Response) {
  return apiErrorBodySchema.parse(res.body).error;
}

function linkOf(res: Response) {
  const { link } = artifactAccessResponseSchema.parse(res.body).access;
  if (!link) throw new Error('Expected a live link');
  return { ...link, token: link.url.slice(link.url.lastIndexOf('/') + 1) };
}

/** Reads any response as raw bytes. */
function bytes(req: request.Test) {
  return req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
}

describe('Share links (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'share-links');
    [ada, bob] = await Promise.all([users.create('Ada'), users.create('Bob')]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** An artifact of Ada's: v1 Markdown, v2 HTML. */
  async function publish(): Promise<string> {
    const res = await http()
      .post('/api/artifacts')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', ada.cookie)
      .field('metadata', JSON.stringify({ title: 'Client report', description: 'For Acme' }))
      .attach('file', fixtures.markdown, 'report.md')
      .expect(201);
    const { id } = artifactResponseSchema.parse(res.body).artifact;
    await addVersion(id, fixtures.html);
    return id;
  }

  async function addVersion(id: string, file: Buffer) {
    await http()
      .post(`/api/artifacts/${id}/versions`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', ada.cookie)
      .field('metadata', '{}')
      .attach('file', file, 'page.html')
      .expect(201);
  }

  const setLink = (user: TestUser, id: string, body: object = {}) =>
    http()
      .put(`/api/artifacts/${id}/access/link`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .send(body);
  const turnOff = (user: TestUser, id: string) =>
    http()
      .delete(`/api/artifacts/${id}/access/link`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie);
  const reset = (user: TestUser, id: string) =>
    http()
      .post(`/api/artifacts/${id}/access/link/reset`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie);
  const getAccess = (id: string) =>
    http().get(`/api/artifacts/${id}/access`).set('Cookie', ada.cookie);

  /** What the link shows, opened without signing in. */
  const shared = (token: string) => http().get(`/api/s/${token}`);
  const sharedContent = (token: string, query: Record<string, string> = {}) =>
    bytes(http().get(`/api/s/${token}/content`).query(query));

  async function sharedVersionNo(token: string): Promise<number> {
    const res = await shared(token).expect(200);
    return sharedArtifactResponseSchema.parse(res.body).artifact.version.versionNo;
  }

  describe('turning a link on', () => {
    it('gives a URL that works without signing in, and stores the token only hashed and sealed', async () => {
      const id = await publish();
      const link = linkOf(await setLink(ada, id).expect(200));
      expect(link).toMatchObject({ pinnedVersionNo: null, expiresAt: null });
      expect(link.url).toMatch(new RegExp(`^${TEST_ORIGIN}/s/[A-Za-z0-9_-]{43}$`));

      const [row] = await app
        .get(DataSource)
        .query('SELECT token_hash, token_ciphertext FROM share_links WHERE artifact_id = $1', [id]);
      expect(row.token_hash).toBe(hashSecretToken(link.token));
      expect(row.token_ciphertext).not.toContain(link.token);

      // The owner can copy it again.
      expect(linkOf(await getAccess(id)).url).toBe(link.url);
    });

    it('shows the latest version, with no-index and no-referrer headers', async () => {
      const id = await publish();
      const { token } = linkOf(await setLink(ada, id));

      const res = await shared(token).expect(200);
      expect(sharedArtifactResponseSchema.parse(res.body)).toEqual({
        artifact: {
          id,
          title: 'Client report',
          description: 'For Acme',
          owner: { displayName: 'Ada' },
          version: expect.objectContaining({ versionNo: 2, mimeType: 'text/html' }),
        },
        expiresAt: null,
      });
      expect(res.headers).toMatchObject({
        'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer',
        'cache-control': 'no-store',
      });
    });

    it('serves the content sandboxed, and as a download', async () => {
      const id = await publish();
      const { token } = linkOf(await setLink(ada, id));

      const res = await sharedContent(token).expect(200);
      expect((res.body as Buffer).equals(fixtures.html)).toBe(true);
      expect(res.headers).toMatchObject({
        'content-security-policy': CONTENT_SECURITY_POLICY,
        'content-disposition': 'inline',
        'x-robots-tag': 'noindex, nofollow',
      });
      const download = await sharedContent(token, { download: '1' }).expect(200);
      // Downloads keep the uploaded file's name, as in the app.
      expect(download.headers['content-disposition']).toMatch(/^attachment; filename="page.html"/);
      await sharedContent(token)
        .set('If-None-Match', res.headers.etag as string)
        .expect(304);
    });

    it('grants nothing inside the app', async () => {
      const id = await publish();
      await setLink(ada, id).expect(200);
      await http().get(`/api/artifacts/${id}`).expect(401);
      await http().get(`/api/artifacts/${id}`).set('Cookie', bob.cookie).expect(404);
    });

    it('is only for the owner', async () => {
      const id = await publish();
      await setLink(bob, id).expect(404);
      await turnOff(bob, id).expect(404);
      await reset(bob, id).expect(404);
      await setLink(ada, id).set('Origin', 'https://evil.example').expect(403);
    });
  });

  describe('changing a link', () => {
    it('keeps the URL when the version or expiry changes', async () => {
      const id = await publish();
      const before = linkOf(await setLink(ada, id));
      const expiresAt = new Date(Date.now() + 7 * DAY).toISOString();
      const after = linkOf(await setLink(ada, id, { versionNo: 1, expiresAt }).expect(200));

      expect(after).toMatchObject({ url: before.url, pinnedVersionNo: 1, expiresAt });
      expect(await sharedVersionNo(after.token)).toBe(1);
      expect((await sharedContent(after.token).expect(200)).body).toEqual(fixtures.markdown);
    });

    it('a pinned link keeps showing its version; an unpinned one follows the latest', async () => {
      const id = await publish();
      const { token } = linkOf(await setLink(ada, id, { versionNo: 1 }));
      await addVersion(id, fixtures.svg);
      expect(await sharedVersionNo(token)).toBe(1);

      await setLink(ada, id, { versionNo: null }).expect(200);
      expect(await sharedVersionNo(token)).toBe(3);
    });

    it('rejects a past expiry and a missing version', async () => {
      const id = await publish();
      const past = await setLink(ada, id, {
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }).expect(400);
      expect(errorOf(past).details).toEqual([
        { path: 'expiresAt', message: 'Choose an expiry date in the future.' },
      ]);
      await setLink(ada, id, { versionNo: 9 }).expect(400);
      expect(artifactAccessResponseSchema.parse((await getAccess(id)).body).access.link).toBeNull();
    });
  });

  describe('when a link stops working', () => {
    it('says it expired, and works again with a new expiry', async () => {
      const id = await publish();
      const { token } = linkOf(
        await setLink(ada, id, { expiresAt: new Date(Date.now() + DAY).toISOString() }),
      );
      await app
        .get(DataSource)
        .query(
          "UPDATE share_links SET expires_at = now() - interval '1 second' WHERE artifact_id = $1",
          [id],
        );

      for (const res of [await shared(token), await sharedContent(token)]) {
        expect(res.status).toBe(410);
      }
      expect(errorOf(await shared(token))).toMatchObject({
        code: ErrorCode.SHARE_EXPIRED,
        message: 'This link has expired.',
      });

      await setLink(ada, id, { expiresAt: new Date(Date.now() + DAY).toISOString() });
      await shared(token).expect(200);
    });

    it('says it was turned off; turning it on again gives a new URL', async () => {
      const id = await publish();
      const { token } = linkOf(await setLink(ada, id));
      const off = artifactAccessResponseSchema.parse((await turnOff(ada, id).expect(200)).body);
      expect(off.access.link).toBeNull();

      expect(errorOf(await shared(token).expect(410))).toMatchObject({
        code: ErrorCode.SHARE_REVOKED,
        message: 'This link was turned off.',
      });
      await sharedContent(token).expect(410);
      await turnOff(ada, id).expect(200);

      const again = linkOf(await setLink(ada, id));
      expect(again.token).not.toBe(token);
      await shared(token).expect(410);
      await shared(again.token).expect(200);
    });

    it('reset replaces the URL and keeps the settings', async () => {
      const id = await publish();
      const before = linkOf(await setLink(ada, id, { versionNo: 1 }));
      const after = linkOf(await reset(ada, id).expect(200));

      expect(after.token).not.toBe(before.token);
      expect(after.pinnedVersionNo).toBe(1);
      await shared(before.token).expect(410);
      expect(await sharedVersionNo(after.token)).toBe(1);

      await turnOff(ada, id);
      expect(errorOf(await reset(ada, id).expect(404)).message).toBe('There is no link to reset.');
    });

    it("doesn't work once the artifact is deleted", async () => {
      const id = await publish();
      const { token } = linkOf(await setLink(ada, id));
      await http()
        .delete(`/api/artifacts/${id}`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .expect(204);
      expect(errorOf(await shared(token).expect(404)).message).toBe("This link doesn't work.");
      await sharedContent(token).expect(404);
    });

    it.each(['x'.repeat(43), 'not-a-token', randomUUID()])(
      "doesn't work for the unknown token %s",
      async (token) => {
        expect(errorOf(await shared(token).expect(404)).code).toBe(ErrorCode.NOT_FOUND);
      },
    );
  });

  describe('rate limit', () => {
    let limited: NestExpressApplication;

    beforeAll(async () => {
      limited = await createTestApp({ env: { RATE_LIMIT_SHARE_LINK_PER_MINUTE: 2 } });
    });

    afterAll(async () => {
      await limited.close();
    });

    const open = () => request(limited.getHttpServer()).get(`/api/s/${'x'.repeat(43)}`);

    it('is counted per client IP', async () => {
      await open().expect(404);
      await open().expect(404);
      expect(errorOf(await open().expect(429)).code).toBe(ErrorCode.RATE_LIMITED);
    });
  });
});
