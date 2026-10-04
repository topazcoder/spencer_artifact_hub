import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactResponseSchema,
  ErrorCode,
  uploadSessionResponseSchema,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { hashSecretToken } from '../src/common/tokens/secret-tokens.js';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { callTool, mcpClients } from './mcp-client.js';
import { TEST_ORIGIN, testEnv } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

/** Small, so the size limit is cheap to hit. */
const MAX_BYTES = 64 * 1024;

function errorCode(res: Response): string {
  return apiErrorBodySchema.parse(res.body).error.code;
}

describe('Upload sessions (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let mcp: Awaited<ReturnType<typeof mcpClients>>;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;
  let adaClient: Client;

  beforeAll(async () => {
    app = await createTestApp({ env: { MAX_ARTIFACT_BYTES: MAX_BYTES } });
    db = app.get(DataSource);
    mcp = await mcpClients(app);
    users = testUsers(app, 'uploads');
    [ada, bob] = await Promise.all([users.create('Ada'), users.create('Bob')]);
    adaClient = await mcp.connect(ada);
    for (const user of [ada, bob]) secrets.set(user.id, await mcp.tokenFor(user));
  });

  afterAll(async () => {
    await mcp.close();
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A draft published without content; returns its id and the upload token. */
  async function draft(): Promise<{ id: string; token: string }> {
    const { data, isError } = await callTool(adaClient, 'publish_artifact', {
      title: 'Q4 chart',
      description: 'The revenue chart for the Q4 review.',
      tags: ['q4'],
    });
    expect(isError).toBe(false);
    const token = data.upload.url.split('/upload/')[1] ?? '';
    return { id: (data.artifact as { id: string }).id, token };
  }

  const describeSession = (user: TestUser, token: string) =>
    http().get(`/api/upload-sessions/${token}`).set('Cookie', user.cookie);

  const uploadForm = (user: TestUser, token: string, file: Buffer, filename: string) =>
    http()
      .post(`/api/upload-sessions/${token}`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .attach('file', file, filename);

  /** Each user's API token, fetched up front so requests can be built synchronously. */
  const secrets = new Map<string, string>();

  function uploadRaw(user: TestUser, token: string, body: Buffer, filename?: string) {
    const req = http()
      .put(`/api/upload-sessions/${token}`)
      .set('Authorization', `Bearer ${secrets.get(user.id)}`)
      .set('Content-Type', 'application/octet-stream');
    if (filename) req.set('X-Filename', filename);
    return req.send(body);
  }

  describe('publish_artifact without content', () => {
    it('creates a draft only its owner can see, with both ways to upload', async () => {
      const { data } = await callTool(adaClient, 'publish_artifact', {
        title: 'Q4 chart',
        description: 'The revenue chart.',
        tags: ['q4'],
      });
      const artifact = data.artifact as { id: string; status: string; version: unknown };
      expect(artifact).toMatchObject({ status: 'draft', version: null });

      const token = data.upload.url.split('/upload/')[1] ?? '';
      expect(data.upload.url).toBe(`${testEnv.APP_BASE_URL}/upload/${token}`);
      expect(data.upload.command).toContain(`${testEnv.APP_BASE_URL}/api/upload-sessions/${token}`);
      expect(data.upload.command).toContain('Authorization: Bearer $ARTIFACT_HUB_TOKEN');
      const minutes = (Date.parse(data.upload.expires_at) - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(29);
      expect(minutes).toBeLessThanOrEqual(30);
      expect(data.next_actions.join(' ')).toMatch(/upload\.command.*upload\.url.*get_artifact/s);

      const details = await callTool(adaClient, 'get_artifact', { artifact: artifact.id });
      expect(details.data.next_actions).toEqual([expect.stringMatching(/request_upload: true/)]);

      await http().get(`/api/artifacts/${artifact.id}`).set('Cookie', bob.cookie).expect(404);
      const mine = await http()
        .get('/api/artifacts?scope=mine')
        .set('Cookie', ada.cookie)
        .expect(200);
      expect(mine.body.items.map((item: { id: string }) => item.id)).not.toContain(artifact.id);
    });

    it('describes the upload to its owner, for the upload page', async () => {
      const { id, token } = await draft();
      const res = await describeSession(ada, token).expect(200);
      expect(uploadSessionResponseSchema.parse(res.body).session).toMatchObject({
        purpose: 'create',
        status: 'open',
        artifact: { id, title: 'Q4 chart' },
        versionNo: 1,
        changeNote: null,
      });
    });
  });

  describe('uploading from the browser page', () => {
    it('publishes the file as version 1, once', async () => {
      const { id, token } = await draft();
      const res = await uploadForm(ada, token, fixtures.png, 'chart.png').expect(201);
      expect(artifactResponseSchema.parse(res.body).artifact).toMatchObject({
        id,
        status: 'published',
        latestVersionNo: 1,
        currentVersion: { mimeType: 'image/png', originalFilename: 'chart.png' },
      });
      const session = await describeSession(ada, token).expect(200);
      expect(session.body.session.status).toBe('done');

      // A repeat returns the same result, without a new version.
      const again = await uploadForm(ada, token, fixtures.pdf, 'other.pdf').expect(201);
      expect(again.body.artifact).toMatchObject({
        latestVersionNo: 1,
        currentVersion: { mimeType: 'image/png' },
      });
    });

    it('releases the session when the file is refused, so the right one can follow', async () => {
      const { token } = await draft();
      const refused = await uploadForm(ada, token, fixtures.zip, 'chart.zip').expect(415);
      expect(errorCode(refused)).toBe(ErrorCode.UNSUPPORTED_TYPE);
      const tooLarge = await uploadForm(ada, token, Buffer.alloc(MAX_BYTES + 1, 1), 'big.png');
      expect(tooLarge.status).toBe(413);
      await uploadForm(ada, token, fixtures.png, 'chart.png').expect(201);
    });
  });

  describe('uploading with PUT', () => {
    it('takes the raw file with an API token, and its name from X-Filename', async () => {
      const { token } = await draft();
      const res = await uploadRaw(ada, token, fixtures.markdown, 'notes.md').expect(200);
      expect(res.body.artifact).toMatchObject({
        latestVersionNo: 1,
        currentVersion: { mimeType: 'text/markdown', originalFilename: 'notes.md' },
      });
    });

    it('refuses an upload larger than the limit before reading it, and stays usable', async () => {
      const { token } = await draft();
      const res = await uploadRaw(ada, token, Buffer.alloc(MAX_BYTES + 1, 1), 'big.pdf');
      expect(res.status).toBe(413);
      expect(errorCode(res)).toBe(ErrorCode.ARTIFACT_TOO_LARGE);
      await uploadRaw(ada, token, fixtures.pdf, 'q4.pdf').expect(200);
    });

    it('refuses a body sent as JSON instead of the file', async () => {
      const { token } = await draft();
      const res = await http()
        .put(`/api/upload-sessions/${token}`)
        .set('Authorization', `Bearer ${secrets.get(ada.id)}`)
        .send({ file: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/curl -T/);
    });
  });

  describe('who can upload', () => {
    it('needs the owner signed in, besides the token', async () => {
      const { token } = await draft();
      // No sign-in at all.
      await http().get(`/api/upload-sessions/${token}`).expect(401);
      await http().put(`/api/upload-sessions/${token}`).send(fixtures.png).expect(401);
      // Someone else's session or API token: as if the link didn't exist.
      expect(errorCode(await describeSession(bob, token).expect(404))).toBe(ErrorCode.NOT_FOUND);
      await uploadForm(bob, token, fixtures.png, 'x.png').expect(404);
      await uploadRaw(bob, token, fixtures.png, 'x.png').expect(404);
      // The page uses the session cookie; PUT only takes an API token.
      await http()
        .put(`/api/upload-sessions/${token}`)
        .set('Cookie', ada.cookie)
        .set('Origin', TEST_ORIGIN)
        .send(fixtures.png)
        .expect(401);
      // Still unused.
      expect((await describeSession(ada, token).expect(200)).body.session.status).toBe('open');
    });

    it("refuses the owner's credentials with a token that doesn't exist", async () => {
      const token = 'x'.repeat(43);
      await describeSession(ada, token).expect(404);
      await uploadRaw(ada, token, fixtures.png, 'x.png').expect(404);
    });

    it('stops working once it expires', async () => {
      const { token } = await draft();
      await db.query(
        "UPDATE upload_sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
        [hashSecretToken(token)],
      );
      expect((await describeSession(ada, token).expect(200)).body.session.status).toBe('expired');
      const res = await uploadForm(ada, token, fixtures.png, 'chart.png').expect(410);
      expect(errorCode(res)).toBe(ErrorCode.UPLOAD_SESSION_EXPIRED);
    });
  });

  describe('update_artifact with request_upload', () => {
    it('uploads the next version, with its change note', async () => {
      const { id, token: first } = await draft();
      await uploadForm(ada, first, fixtures.png, 'v1.png').expect(201);

      const { data } = await callTool(adaClient, 'update_artifact', {
        artifact: id,
        request_upload: true,
        change_note: 'Added December',
      });
      const token = data.upload.url.split('/upload/')[1] ?? '';
      expect((await describeSession(ada, token).expect(200)).body.session).toMatchObject({
        purpose: 'new_version',
        versionNo: 2,
        changeNote: 'Added December',
      });
      const res = await uploadRaw(ada, token, fixtures.pdf, 'q4.pdf').expect(200);
      expect(res.body.artifact).toMatchObject({
        latestVersionNo: 2,
        currentVersion: { mimeType: 'application/pdf', changeNote: 'Added December' },
      });
    });

    it('takes content or request_upload, not both', async () => {
      const { id } = await draft();
      const result = await callTool(adaClient, 'update_artifact', {
        artifact: id,
        request_upload: true,
        content: '# notes',
      });
      expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/not both/) });
    });
  });
});
