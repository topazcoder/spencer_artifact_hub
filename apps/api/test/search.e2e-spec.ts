import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactListResponseSchema,
  artifactResponseSchema,
  artifactTagListResponseSchema,
  ErrorCode,
} from '@artifact-hub/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

/** A word no other test uses, so searches only find this run's artifacts. */
function uniqueWord(): string {
  return `zq${randomUUID()
    .replace(/[^a-f]/g, '')
    .slice(0, 10)}`;
}

describe('Search and filters (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'search');
    [ada, bob] = await Promise.all([users.create('Ada'), users.create('Bob')]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function publish(
    user: TestUser,
    metadata: { title: string; description?: string; tags?: string[]; visibility?: 'public' },
    file: [Buffer, string] = [fixtures.markdown, 'notes.md'],
  ): Promise<string> {
    const res = await http()
      .post('/api/artifacts')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .field('metadata', JSON.stringify(metadata))
      .attach('file', ...file)
      .expect(201);
    return artifactResponseSchema.parse(res.body).artifact.id;
  }

  async function titles(user: TestUser, query: Record<string, string>): Promise<string[]> {
    const res = await http()
      .get('/api/artifacts')
      .query({ pageSize: 50, ...query })
      .set('Cookie', user.cookie)
      .expect(200);
    return artifactListResponseSchema.parse(res.body).items.map((item) => item.title);
  }

  describe('search', () => {
    let word: string;

    beforeAll(async () => {
      word = uniqueWord();
      await publish(ada, { title: `Pricing page ${word}`, tags: ['marketing'] });
      await publish(ada, {
        title: `Roadmap ${word}`,
        description: 'Includes the new pricing tiers',
      });
      await publish(ada, { title: `Team offsite ${word}`, tags: ['pricing'] });
      await publish(ada, { title: `Unrelated ${word}` });
    });

    it('matches every word, as whole words or their starts', async () => {
      expect(await titles(ada, { q: `${word} pric pag` })).toEqual([`Pricing page ${word}`]);
      expect(await titles(ada, { q: `page ${word.slice(0, 6)}` })).toEqual([
        `Pricing page ${word}`,
      ]);
      expect(await titles(ada, { q: `${word} nothing` })).toEqual([]);
    });

    it('finds words in tags and descriptions, ranking title matches first', async () => {
      const found = await titles(ada, { q: `${word} pricing` });
      expect(found[0]).toBe(`Pricing page ${word}`);
      expect(found.toSorted()).toEqual(
        [`Pricing page ${word}`, `Roadmap ${word}`, `Team offsite ${word}`].toSorted(),
      );
    });

    it('matches other forms of a word', async () => {
      expect(await titles(ada, { q: `${word} prices` })).toContain(`Pricing page ${word}`);
    });

    it('ignores characters that are not letters or digits', async () => {
      expect(await titles(ada, { q: `${word} & pricing | !page:*` })).toEqual([
        `Pricing page ${word}`,
      ]);
      // Nothing searchable left: no search at all.
      expect((await titles(ada, { q: '!!!' })).length).toBeGreaterThanOrEqual(4);
    });

    it('stays within what the user may see', async () => {
      expect(await titles(bob, { q: word, scope: 'public' })).toEqual([]);
      expect(await titles(bob, { q: word, scope: 'mine' })).toEqual([]);
    });

    it('finds new titles and extracted text as soon as they change', async () => {
      const id = await publish(ada, { title: `Draft ${word}` });
      await http()
        .patch(`/api/artifacts/${id}`)
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', ada.cookie)
        .send({ title: `Quarterly review ${word}` })
        .expect(200);
      expect(await titles(ada, { q: `${word} quarterly` })).toEqual([`Quarterly review ${word}`]);

      // Filled in later by the text extraction job.
      await app.get(DataSource).query(
        `UPDATE artifact_versions SET extracted_text = 'mentions the zebrafish study'
           WHERE artifact_id = $1`,
        [id],
      );
      expect(await titles(ada, { q: `${word} zebrafish` })).toEqual([`Quarterly review ${word}`]);
    });

    it('rejects an overly long search', async () => {
      const res = await http()
        .get('/api/artifacts')
        .query({ q: 'x'.repeat(201) })
        .set('Cookie', ada.cookie)
        .expect(400);
      expect(apiErrorBodySchema.parse(res.body).error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('filters', () => {
    let word: string;

    beforeAll(async () => {
      word = uniqueWord();
      await publish(ada, { title: `Deck ${word}`, tags: ['q3', 'sales'] }, [
        fixtures.pdf,
        'deck.pdf',
      ]);
      await publish(ada, { title: `Mockup ${word}`, tags: ['q3'] }, [fixtures.html, 'mock.html']);
      await publish(ada, { title: `Chart ${word}` }, [fixtures.png, 'chart.png']);
    });

    it('narrows by type, using the current version', async () => {
      expect(await titles(ada, { q: word, type: 'pdf' })).toEqual([`Deck ${word}`]);
      expect(await titles(ada, { q: word, type: 'image' })).toEqual([`Chart ${word}`]);
      expect(await titles(ada, { q: word, type: 'markdown' })).toEqual([]);
    });

    it('narrows by tag, combined with the other filters', async () => {
      expect((await titles(ada, { q: word, tag: 'Q3' })).toSorted()).toEqual(
        [`Deck ${word}`, `Mockup ${word}`].toSorted(),
      );
      expect(await titles(ada, { q: word, tag: 'q3', type: 'html' })).toEqual([`Mockup ${word}`]);
    });

    it('narrows by several tags at once: artifacts with all of them', async () => {
      const res = (tags: string[]) =>
        http()
          .get('/api/artifacts')
          .query({ q: word, tag: tags })
          .set('Cookie', ada.cookie)
          .expect(200);
      const found = async (tags: string[]) =>
        artifactListResponseSchema.parse((await res(tags)).body).items.map((item) => item.title);

      expect(await found(['q3', 'sales'])).toEqual([`Deck ${word}`]);
      expect((await found(['Q3'])).toSorted()).toEqual(
        [`Deck ${word}`, `Mockup ${word}`].toSorted(),
      );
      expect(await found(['sales', 'nope'])).toEqual([]);
      await http()
        .get('/api/artifacts')
        .query({ tag: Array.from({ length: 11 }, (_, i) => `t${i}`) })
        .set('Cookie', ada.cookie)
        .expect(400);
    });

    it('narrows by owner: part of their name, any case, or their exact email', async () => {
      const sara = await users.create(`Sara ${word}`);
      await publish(sara, { title: `Report ${word}`, visibility: 'public' });
      await publish(ada, { title: `Notes ${word}`, visibility: 'public' });
      const search = { q: word, scope: 'public' };

      expect(await titles(bob, { ...search, owner: `SARA ${word.slice(0, 5)}` })).toEqual([
        `Report ${word}`,
      ]);
      expect(await titles(bob, { ...search, owner: sara.email.toUpperCase() })).toEqual([
        `Report ${word}`,
      ]);
      // Not the start of an email, and wildcards match only themselves.
      expect(await titles(bob, { ...search, owner: sara.email.slice(0, 10) })).toEqual([]);
      expect(await titles(bob, { ...search, owner: '%' })).toEqual([]);
    });

    it('narrows by owner id, within the scope', async () => {
      const sara = await users.create(`Sara ${word}`);
      await publish(sara, { title: `Report ${word}`, visibility: 'public' });
      await publish(ada, { title: `Notes ${word}`, visibility: 'public' });
      const search = { q: word, scope: 'public' };

      expect(await titles(bob, { ...search, ownerId: sara.id })).toEqual([`Report ${word}`]);
      expect(await titles(bob, { ...search, ownerId: randomUUID() })).toEqual([]);
      // The scope still applies: Sara's public artifact isn't in Bob's own.
      expect(await titles(bob, { q: word, ownerId: sara.id })).toEqual([]);
      await http()
        .get('/api/artifacts')
        .query({ ownerId: 'not-an-id' })
        .set('Cookie', bob.cookie)
        .expect(400);
    });

    it('narrows by the days it was last updated, inclusive (UTC)', async () => {
      await app.get(DataSource).query(
        `UPDATE artifacts SET updated_at = CASE
           WHEN title = $1 THEN timestamptz '2026-01-15T23:30:00Z'
           ELSE timestamptz '2026-01-16T00:30:00Z' END
         WHERE title IN ($1, $2)`,
        [`Deck ${word}`, `Mockup ${word}`],
      );
      expect(await titles(ada, { q: word, updatedTo: '2026-01-15' })).toEqual([`Deck ${word}`]);
      expect(
        await titles(ada, { q: word, updatedFrom: '2026-01-16', updatedTo: '2026-01-16' }),
      ).toEqual([`Mockup ${word}`]);
      expect(await titles(ada, { q: word, updatedFrom: '2026-01-16' })).not.toContain(
        `Deck ${word}`,
      );
    });

    it('sorts by publish date or last update, the latest update first by default', async () => {
      // Published in one order, last updated in the reverse.
      await app.get(DataSource).query(
        `UPDATE artifacts SET
           created_at = CASE title
             WHEN $1 THEN timestamptz '2026-01-10T00:00:00Z'
             WHEN $2 THEN timestamptz '2026-01-11T00:00:00Z'
             ELSE timestamptz '2026-01-12T00:00:00Z' END,
           updated_at = CASE title
             WHEN $1 THEN timestamptz '2026-02-12T00:00:00Z'
             WHEN $2 THEN timestamptz '2026-02-11T00:00:00Z'
             ELSE timestamptz '2026-02-10T00:00:00Z' END
         WHERE title IN ($1, $2, $3)`,
        [`Deck ${word}`, `Mockup ${word}`, `Chart ${word}`],
      );
      const oldestFirst = [`Deck ${word}`, `Mockup ${word}`, `Chart ${word}`];
      // Other tests add artifacts with this word; only these three have fixed dates.
      const mine = async (sort?: string) =>
        (await titles(ada, { q: word, ...(sort ? { sort } : {}) })).filter((title) =>
          oldestFirst.includes(title),
        );
      expect(await mine('oldest')).toEqual(oldestFirst);
      expect(await mine('newest')).toEqual(oldestFirst.toReversed());
      expect(await mine('updated_asc')).toEqual(oldestFirst.toReversed());
      expect(await mine('updated_desc')).toEqual(oldestFirst);
      expect(await mine()).toEqual(await mine('updated_desc'));
    });

    it('rejects unknown sorts', async () => {
      await http()
        .get('/api/artifacts')
        .query({ sort: 'random' })
        .set('Cookie', ada.cookie)
        .expect(400);
    });

    it('rejects invalid dates', async () => {
      await http()
        .get('/api/artifacts')
        .query({ updatedFrom: '2026-13-01' })
        .set('Cookie', ada.cookie)
        .expect(400);
    });

    it('rejects unknown types', async () => {
      await http()
        .get('/api/artifacts')
        .query({ type: 'video' })
        .set('Cookie', ada.cookie)
        .expect(400);
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns the user, for a signed-in caller only', async () => {
      const res = await http().get(`/api/users/${bob.id}`).set('Cookie', ada.cookie).expect(200);
      expect(res.body).toEqual({
        user: { id: bob.id, displayName: bob.displayName, email: bob.email },
      });
      await http().get(`/api/users/${bob.id}`).expect(401);
    });

    it('answers not found for an unknown or malformed id', async () => {
      await http().get(`/api/users/${randomUUID()}`).set('Cookie', ada.cookie).expect(404);
      await http().get('/api/users/nope').set('Cookie', ada.cookie).expect(404);
    });
  });

  describe('GET /api/artifacts/tags', () => {
    it('lists the tags in a scope, the most used first', async () => {
      const carol = await users.create('Carol');
      await publish(carol, { title: 'One', tags: ['beta', 'alpha'] });
      await publish(carol, { title: 'Two', tags: ['beta'] });
      await publish(bob, { title: 'Not Carol’s', tags: ['secret'] });

      const res = await http()
        .get('/api/artifacts/tags')
        .query({ scope: 'mine' })
        .set('Cookie', carol.cookie)
        .expect(200);
      expect(artifactTagListResponseSchema.parse(res.body).items).toEqual([
        { tag: 'beta', count: 2 },
        { tag: 'alpha', count: 1 },
      ]);
    });

    it('searches the tags and returns only a few', async () => {
      const erin = await users.create('Erin');
      const prefix = uniqueWord();
      const names = Array.from(
        { length: 12 },
        (_, i) => `${prefix}-t${String(i).padStart(2, '0')}`,
      );
      await publish(erin, { title: 'Many', tags: names.slice(0, 10) });
      await publish(erin, { title: 'More', tags: names.slice(10) });
      await publish(erin, { title: 'Other', tags: ['unrelated'] });
      const tags = async (q?: string) =>
        artifactTagListResponseSchema
          .parse(
            (
              await http()
                .get('/api/artifacts/tags')
                .query({ scope: 'mine', ...(q ? { q } : {}) })
                .set('Cookie', erin.cookie)
                .expect(200)
            ).body,
          )
          .items.map((item) => item.tag);

      // Without a search, a few: the cap is 10 of the 13 tags.
      expect(await tags()).toHaveLength(10);
      // Containing the text, any case, and still capped.
      expect(await tags(prefix.toUpperCase())).toHaveLength(10);
      expect(await tags(`${prefix}-T11`)).toEqual([`${prefix}-t11`]);
      expect(await tags('unrel')).toEqual(['unrelated']);
      // Wildcards match only themselves.
      expect(await tags('%')).toEqual([]);
      expect(await tags('no-such-tag')).toEqual([]);
    });

    it('never includes tags of artifacts the user may not see', async () => {
      const dave = await users.create('Dave');
      await publish(bob, { title: 'Private', tags: [`hidden-${uniqueWord()}`] });
      const res = await http()
        .get('/api/artifacts/tags')
        .query({ scope: 'public' })
        .set('Cookie', dave.cookie)
        .expect(200);
      const tags = artifactTagListResponseSchema.parse(res.body).items.map((item) => item.tag);
      expect(tags.some((tag) => tag.startsWith('hidden-'))).toBe(false);
    });
  });
});
