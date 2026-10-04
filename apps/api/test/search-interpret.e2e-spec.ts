import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode, apiErrorBodySchema, searchInterpretationSchema } from '@artifact-hub/shared';
import request from 'supertest';
import { AiProviderError } from '../src/ai/ai.errors.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { createTestApp } from './create-test-app.js';
import { FakeAiProvider } from './fake-ai-provider.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN, testEnv } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

const answer = {
  keywords: 'pricing',
  scope: 'shared',
  type: 'pdf',
  tag: 'Marketing',
  owner: 'Sara',
  updatedFrom: '2026-09-28',
  updatedTo: '2026-10-04',
};

describe('Natural-language search (e2e)', () => {
  describe('with AI', () => {
    let app: NestExpressApplication;
    let users: ReturnType<typeof testUsers>;
    let ada: TestUser;
    const ai = new FakeAiProvider();

    beforeAll(async () => {
      app = await createTestApp({ overrides: [{ provide: AI_PROVIDER, useValue: ai }] });
      users = testUsers(app, 'nl-search');
      ada = await users.create('Ada');
      await request(app.getHttpServer())
        .post('/api/artifacts')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .field('metadata', JSON.stringify({ title: 'Launch', tags: ['marketing'] }))
        .attach('file', fixtures.markdown, 'launch.md')
        .expect(201);
    });

    afterAll(async () => {
      await users.cleanup();
      await app.close();
    });

    const interpret = (query: Record<string, string>, user = ada) =>
      request(app.getHttpServer())
        .get('/api/search/interpret')
        .query(query)
        .set('Cookie', user.cookie);

    it('says AI is on in the client config', async () => {
      const res = await request(app.getHttpServer()).get('/api/config').expect(200);
      expect(res.body.features).toEqual({ ai: true });
    });

    it('turns the search into gallery filters with the fast model', async () => {
      ai.answer = () => answer;
      const res = await interpret({
        q: 'the pricing PDF Sara shared last week about marketing',
        scope: 'mine',
      }).expect(200);
      expect(searchInterpretationSchema.parse(res.body)).toEqual({
        interpreted: true,
        filters: {
          scope: 'shared',
          q: 'pricing',
          type: 'pdf',
          tag: ['marketing'],
          owner: 'Sara',
          updatedFrom: '2026-09-28',
          updatedTo: '2026-10-04',
        },
      });

      const sent = ai.requests.at(-1)!;
      expect(sent.model).toBe(testEnv.AI_MODEL_FAST);
      // The user's own tags, to pick from; the search as data.
      expect(sent.prompt).toMatch(/source="tags">\n[^<]*marketing/);
      expect(sent.prompt).toContain(
        '<untrusted_content source="search">\nthe pricing PDF Sara shared last week about marketing\n',
      );
    });

    it('falls back to a keyword search for the text when AI fails', async () => {
      ai.answer = () => {
        throw new AiProviderError('down', { retryable: false });
      };
      const res = await interpret({ q: 'pricing deck', scope: 'public' }).expect(200);
      expect(res.body).toEqual({
        interpreted: false,
        filters: { scope: 'public', q: 'pricing deck' },
      });
    });

    it('falls back when the answer has the wrong shape', async () => {
      ai.answer = () => ({ keywords: 42 });
      const res = await interpret({ q: 'pricing deck' }).expect(200);
      expect(res.body).toEqual({
        interpreted: false,
        filters: { scope: 'mine', q: 'pricing deck' },
      });
    });

    it('needs a search, and a signed-in user', async () => {
      const res = await interpret({ q: '  ' }).expect(400);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe(ErrorCode.VALIDATION_FAILED);
      await request(app.getHttpServer())
        .get('/api/search/interpret')
        .query({ q: 'pricing' })
        .expect(401);
    });
  });

  describe('without AI', () => {
    let app: NestExpressApplication;
    let users: ReturnType<typeof testUsers>;

    beforeAll(async () => {
      app = await createTestApp();
      users = testUsers(app, 'nl-search-off');
    });

    afterAll(async () => {
      await users.cleanup();
      await app.close();
    });

    it('searches for the text as keywords', async () => {
      const ada = await users.create('Ada');
      const res = await request(app.getHttpServer())
        .get('/api/search/interpret')
        .query({ q: 'pricing deck from Sara', scope: 'shared' })
        .set('Cookie', ada.cookie)
        .expect(200);
      expect(res.body).toEqual({
        interpreted: false,
        filters: { scope: 'shared', q: 'pricing deck from Sara' },
      });
    });
  });
});
