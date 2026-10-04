import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ErrorCode,
  apiErrorBodySchema,
  artifactResponseSchema,
  feedbackSummaryResponseSchema,
} from '@artifact-hub/shared';
import request from 'supertest';
import { AiProviderError } from '../src/ai/ai.errors.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { createTestApp } from './create-test-app.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN, testEnv } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

/** An answer citing the first two comments. */
const answer = {
  overview: 'Reviewers like the colors; the header is still too big.',
  themes: [
    {
      title: 'Header size',
      summary: 'The header should be about half its size.',
      sentiment: 'negative',
      status: 'open',
      comments: ['c1', 'c2'],
    },
  ],
  disagreements: [],
};

describe('Feedback summaries (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  const ai = new FakeAiProvider();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: AI_PROVIDER, useValue: ai }],
      // Failures on purpose below must not pause AI for the rest of the suite.
      env: { AI_CIRCUIT_FAILURE_THRESHOLD: 100 },
    });
    users = testUsers(app, 'summaries');
    [ada, bob, carol] = await Promise.all([
      users.create('Ada'),
      users.create('Bob'),
      users.create('Carol'),
    ]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  beforeEach(() => {
    ai.answer = () => answer;
  });

  const http = () => request(app.getHttpServer());
  const send = (method: 'post' | 'patch', user: TestUser, path: string) =>
    http()[method](`/api${path}`).set('Origin', TEST_ORIGIN).set('Cookie', user.cookie);

  /** A private artifact of Ada's with two versions; Bob may comment on every version. */
  async function publish(): Promise<string> {
    const res = await send('post', ada, '/artifacts')
      .field('metadata', JSON.stringify({ title: 'Pricing page' }))
      .attach('file', fixtures.html, 'pricing.html')
      .expect(201);
    const id = artifactResponseSchema.parse(res.body).artifact.id;
    await send('post', ada, `/artifacts/${id}/versions`)
      .field('metadata', '{}')
      .attach('file', fixtures.markdown, 'notes.md')
      .expect(201);
    await send('post', ada, `/artifacts/${id}/access/people`)
      .send({ emails: [bob.email], permission: 'comment', versionNo: null })
      .expect(201);
    return id;
  }

  async function comment(user: TestUser, id: string, body: object): Promise<string> {
    const res = await send('post', user, `/artifacts/${id}/comments`).send(body).expect(201);
    return res.body.comment.id;
  }

  async function summary(user: TestUser, id: string, query: object = {}) {
    const res = await http()
      .get(`/api/artifacts/${id}/feedback-summary`)
      .query(query)
      .set('Cookie', user.cookie)
      .expect(200);
    return feedbackSummaryResponseSchema.parse(res.body);
  }

  async function summarize(user: TestUser, id: string, query: object = {}) {
    const res = await send('post', user, `/artifacts/${id}/feedback-summary`)
      .query(query)
      .expect(200);
    return feedbackSummaryResponseSchema.parse(res.body);
  }

  it('has nothing to summarize without comments', async () => {
    const id = await publish();
    const calls = ai.requests.length;
    expect(await summary(ada, id)).toEqual({ summary: null, outdated: false });
    expect(await summarize(ada, id)).toEqual({ summary: null, outdated: false });
    expect(ai.requests.length).toBe(calls);
  });

  it('summarizes on request with the smart model, and keeps it until comments change', async () => {
    const id = await publish();
    const header = await comment(ada, id, { body: 'The header is too big.' });
    const reply = await comment(bob, id, { body: 'Agreed, half the size.', parentId: header });
    await comment(bob, id, { body: 'Love the colors.', versionNo: 1 });
    const calls = ai.requests.length;

    const first = await summarize(bob, id);
    expect(first).toEqual({
      summary: {
        overview: answer.overview,
        themes: [
          {
            title: 'Header size',
            summary: 'The header should be about half its size.',
            sentiment: 'negative',
            status: 'open',
            commentIds: [header, reply],
          },
        ],
        disagreements: [],
        versionNo: null,
        commentCount: 3,
        partial: false,
        generatedAt: expect.any(String),
      },
      outdated: false,
    });
    const sent = ai.requests.at(-1)!;
    expect(sent.model).toBe(testEnv.AI_MODEL_SMART);
    expect(sent.prompt).toContain('<untrusted_content source="comments">');
    expect(sent.prompt).toContain('[c1] Ada, on v2, open:\nThe header is too big.');

    // Saved, for everyone who can read the comments; asking again doesn't call AI.
    expect(await summary(ada, id)).toEqual(first);
    expect(await summarize(ada, id)).toEqual(first);
    expect(ai.requests.length).toBe(calls + 1);

    await send('patch', ada, `/comments/${header}`).send({ resolved: true }).expect(200);
    expect(await summary(ada, id)).toEqual({ ...first, outdated: true });
    ai.answer = () => ({ ...answer, overview: 'The header is fixed.' });
    const second = await summarize(ada, id);
    expect(second).toMatchObject({
      summary: { overview: 'The header is fixed.' },
      outdated: false,
    });
    expect(ai.requests.length).toBe(calls + 2);
    expect(await summary(bob, id)).toEqual(second);
  });

  it('summarizes one version on its own', async () => {
    const id = await publish();
    await comment(ada, id, { body: 'On the latest version.' });
    await comment(ada, id, { body: 'On the first version.', versionNo: 1 });

    const v1 = await summarize(ada, id, { version: 1 });
    expect(v1.summary).toMatchObject({ versionNo: 1, commentCount: 1 });
    const sent = ai.requests.at(-1)!;
    expect(sent.prompt).toContain('On the first version.');
    expect(sent.prompt).not.toContain('On the latest version.');
    // Every version has its own summary.
    expect(await summary(ada, id)).toEqual({ summary: null, outdated: false });
  });

  it('keeps the saved summary and answers AI_UNAVAILABLE when AI fails', async () => {
    const id = await publish();
    await comment(ada, id, { body: 'First.' });
    const saved = await summarize(ada, id);
    await comment(bob, id, { body: 'Second.' });

    ai.answer = () => {
      throw new AiProviderError('down', { retryable: false });
    };
    const res = await send('post', ada, `/artifacts/${id}/feedback-summary`).expect(503);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe(ErrorCode.AI_UNAVAILABLE);
    expect(await summary(ada, id)).toEqual({ ...saved, outdated: true });
  });

  it("never shows a viewer a summary of comments they can't see", async () => {
    const id = await publish();
    await comment(ada, id, { body: 'Secret plans for v2.' });
    await summarize(ada, id);
    // Bob now sees version 1 only.
    await send('patch', ada, `/artifacts/${id}/access/people/${bob.id}`)
      .send({ versionNo: 1 })
      .expect(200);
    expect(await summary(bob, id)).toEqual({ summary: null, outdated: false });

    await http()
      .get(`/api/artifacts/${id}/feedback-summary`)
      .set('Cookie', carol.cookie)
      .expect(404);
    await send('post', carol, `/artifacts/${id}/feedback-summary`).expect(404);
    await http()
      .get(`/api/artifacts/${id}/feedback-summary`)
      .query({ version: 9 })
      .set('Cookie', ada.cookie)
      .expect(404);
  });

  describe('without AI', () => {
    let offApp: NestExpressApplication;

    beforeAll(async () => {
      offApp = await createTestApp();
    });

    afterAll(async () => {
      await offApp.close();
    });

    it('answers AI_UNAVAILABLE, saying summaries are not available', async () => {
      const id = await publish();
      await comment(ada, id, { body: 'Nice.' });
      const res = await request(offApp.getHttpServer())
        .post(`/api/artifacts/${id}/feedback-summary`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .expect(503);
      expect(apiErrorBodySchema.parse(res.body).error).toMatchObject({
        code: ErrorCode.AI_UNAVAILABLE,
        message: 'Feedback summaries are not available.',
      });
    });
  });
});
