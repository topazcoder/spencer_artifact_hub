import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactAccessResponseSchema,
  artifactListResponseSchema,
  artifactResponseSchema,
  artifactVersionListResponseSchema,
  ErrorCode,
  userSearchResponseSchema,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

function errorOf(res: Response) {
  return apiErrorBodySchema.parse(res.body).error;
}

function accessOf(res: Response) {
  return artifactAccessResponseSchema.parse(res.body).access;
}

describe('Sharing (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;
  let carol: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'sharing');
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

  const http = () => request(app.getHttpServer());

  async function publish(user: TestUser): Promise<string> {
    const res = await http()
      .post('/api/artifacts')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .field('metadata', JSON.stringify({ title: 'Roadmap' }))
      .attach('file', fixtures.markdown, 'roadmap.md')
      .expect(201);
    return artifactResponseSchema.parse(res.body).artifact.id;
  }

  async function addVersion(user: TestUser, id: string, file = fixtures.html) {
    await http()
      .post(`/api/artifacts/${id}/versions`)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .field('metadata', '{}')
      .attach('file', file, 'page.html')
      .expect(201);
  }

  /** A published artifact of Ada's with versions 1 and 2. */
  async function twoVersions(): Promise<string> {
    const id = await publish(ada);
    await addVersion(ada, id);
    return id;
  }

  function send(method: 'put' | 'post' | 'patch' | 'delete', user: TestUser, path: string) {
    return http()[method](`/api${path}`).set('Origin', TEST_ORIGIN).set('Cookie', user.cookie);
  }

  const getAccess = (user: TestUser, id: string) =>
    http().get(`/api/artifacts/${id}/access`).set('Cookie', user.cookie);
  const setCompany = (user: TestUser, id: string, body: object) =>
    send('put', user, `/artifacts/${id}/access/company`).send(body);
  const sharePeople = (user: TestUser, id: string, body: object) =>
    send('post', user, `/artifacts/${id}/access/people`).send(body);
  const updatePerson = (user: TestUser, id: string, userId: string, body: object) =>
    send('patch', user, `/artifacts/${id}/access/people/${userId}`).send(body);
  const removePerson = (user: TestUser, id: string, userId: string) =>
    send('delete', user, `/artifacts/${id}/access/people/${userId}`);

  const get = (user: TestUser, id: string) =>
    http().get(`/api/artifacts/${id}`).set('Cookie', user.cookie);
  const content = (user: TestUser, id: string, versionNo: number) =>
    http().get(`/api/artifacts/${id}/versions/${versionNo}/content`).set('Cookie', user.cookie);

  const search = (user: TestUser, q: string) =>
    http().get('/api/users/search').query({ q }).set('Cookie', user.cookie);

  async function artifactAs(user: TestUser, id: string) {
    return artifactResponseSchema.parse((await get(user, id).expect(200)).body).artifact;
  }

  async function versionNos(user: TestUser, id: string): Promise<number[]> {
    const res = await http()
      .get(`/api/artifacts/${id}/versions`)
      .set('Cookie', user.cookie)
      .expect(200);
    return artifactVersionListResponseSchema.parse(res.body).items.map((v) => v.versionNo);
  }

  /** Which of `among` appear in `user`'s list for `scope` (other suites share the database). */
  async function listed(user: TestUser, scope: string, among: string[]): Promise<string[]> {
    const res = await http()
      .get('/api/artifacts')
      .query({ scope, pageSize: 50 })
      .set('Cookie', user.cookie)
      .expect(200);
    return artifactListResponseSchema
      .parse(res.body)
      .items.map((item) => item.id)
      .filter((id) => among.includes(id));
  }

  describe('access settings', () => {
    it('start with nobody but the owner', async () => {
      const id = await publish(ada);
      expect(accessOf(await getAccess(ada, id).expect(200))).toEqual({
        company: { enabled: false, pinnedVersionNo: null },
        people: [],
      });
    });

    it('are only for the owner: 404 without access, 403 with it', async () => {
      const id = await publish(ada);
      // Each request is created only when awaited: supertest starts a server per request.
      for (const attempt of [
        () => getAccess(bob, id),
        () => setCompany(bob, id, { enabled: true }),
        () => sharePeople(bob, id, { emails: [carol.email], permission: 'view' }),
        () => removePerson(bob, id, carol.id),
      ]) {
        await attempt().expect(404);
      }

      await sharePeople(ada, id, { emails: [bob.email], permission: 'comment' }).expect(201);
      expect(errorOf(await getAccess(bob, id).expect(403)).code).toBe(ErrorCode.FORBIDDEN);
      await sharePeople(bob, id, { emails: [carol.email], permission: 'view' }).expect(403);
      await setCompany(bob, id, { enabled: true }).expect(403);
    });

    it('require a same-origin request to change', async () => {
      const id = await publish(ada);
      await setCompany(ada, id, { enabled: true })
        .set('Origin', 'https://evil.example')
        .expect(403);
      await get(bob, id).expect(404);
    });

    it('reject a version that does not exist', async () => {
      const id = await publish(ada);
      for (const attempt of [
        () => setCompany(ada, id, { enabled: true, versionNo: 3 }),
        () => sharePeople(ada, id, { emails: [bob.email], permission: 'view', versionNo: 3 }),
      ]) {
        const error = errorOf(await attempt().expect(400));
        expect(error.details).toEqual([{ path: 'versionNo', message: 'There is no version 3.' }]);
      }
    });
  });

  describe('everyone at the company', () => {
    it('lets every signed-in user find, view and comment, until turned off', async () => {
      const id = await publish(ada);
      await get(bob, id).expect(404);

      const on = accessOf(await setCompany(ada, id, { enabled: true }).expect(200));
      expect(on.company).toEqual({ enabled: true, pinnedVersionNo: null });
      expect(await artifactAs(bob, id)).toMatchObject({
        visibility: 'public',
        permissions: { comment: true, edit: false, share: false, delete: false },
      });
      expect(await listed(carol, 'public', [id])).toEqual([id]);

      await setCompany(ada, id, { enabled: false }).expect(200);
      await get(bob, id).expect(404);
      await content(bob, id, 1).expect(404);
      expect(await listed(carol, 'public', [id])).toEqual([]);
    });

    it('can show only a pinned version, even after new ones', async () => {
      const id = await twoVersions();
      const access = accessOf(await setCompany(ada, id, { enabled: true, versionNo: 1 }));
      expect(access.company).toEqual({ enabled: true, pinnedVersionNo: 1 });

      expect(await artifactAs(bob, id)).toMatchObject({
        latestVersionNo: 1,
        currentVersion: { versionNo: 1 },
      });
      expect(await versionNos(bob, id)).toEqual([1]);
      await content(bob, id, 1).expect(200);
      await content(bob, id, 2).expect(404);

      await addVersion(ada, id, fixtures.svg);
      expect((await artifactAs(bob, id)).currentVersion?.versionNo).toBe(1);
      expect((await artifactAs(ada, id)).currentVersion?.versionNo).toBe(3);

      // Back to the latest.
      await setCompany(ada, id, { enabled: true, versionNo: null }).expect(200);
      expect(await versionNos(bob, id)).toEqual([3, 2, 1]);
    });

    it('forgets the pinned version when turned off', async () => {
      const id = await twoVersions();
      await setCompany(ada, id, { enabled: true, versionNo: 1 }).expect(200);
      const off = accessOf(await setCompany(ada, id, { enabled: false, versionNo: 1 }));
      expect(off.company).toEqual({ enabled: false, pinnedVersionNo: null });
    });
  });

  describe('people', () => {
    it('gives each person access, listed for the owner and in their Shared with me', async () => {
      const id = await publish(ada);
      const res = await sharePeople(ada, id, { emails: [bob.email], permission: 'view' });
      expect(res.status).toBe(201);
      expect(accessOf(res).people).toEqual([
        {
          user: { id: bob.id, displayName: 'Bob', email: bob.email },
          permission: 'view',
          pinnedVersionNo: null,
          sharedAt: expect.any(String),
        },
      ]);

      expect((await artifactAs(bob, id)).permissions).toEqual({
        comment: false,
        edit: false,
        share: false,
        delete: false,
      });
      await content(bob, id, 1).expect(200);
      await get(carol, id).expect(404);
      expect(await listed(bob, 'shared', [id])).toEqual([id]);
      expect(await listed(carol, 'shared', [id])).toEqual([]);
      // Not shared with the company.
      expect(await listed(bob, 'public', [id])).toEqual([]);
    });

    it('lets people with comment access comment, and nothing more', async () => {
      const id = await publish(ada);
      await sharePeople(ada, id, { emails: [bob.email], permission: 'comment' }).expect(201);
      expect((await artifactAs(bob, id)).permissions).toMatchObject({ comment: true, edit: false });
      await send('patch', bob, `/artifacts/${id}`).send({ title: 'Mine' }).expect(403);
    });

    it('adds nobody when any email is unknown, and says which', async () => {
      const id = await publish(ada);
      const unknown = `nobody-${randomUUID().slice(0, 8)}@example.com`;
      const res = await sharePeople(ada, id, {
        emails: [bob.email, unknown.toUpperCase()],
        permission: 'view',
      }).expect(422);
      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.SHARE_RECIPIENT_UNKNOWN,
        message: `No one at Artifact Hub has this email: ${unknown}.`,
        details: { unknownEmails: [unknown] },
      });
      expect(accessOf(await getAccess(ada, id)).people).toEqual([]);
      await get(bob, id).expect(404);
    });

    it('matches emails in any case, ignores duplicates and the owner', async () => {
      const id = await publish(ada);
      const res = await sharePeople(ada, id, {
        emails: [bob.email.toUpperCase(), bob.email, ada.email],
        permission: 'view',
      }).expect(201);
      expect(accessOf(res).people.map((person) => person.user.id)).toEqual([bob.id]);
    });

    it('updates people who already have access instead of adding them twice', async () => {
      const id = await twoVersions();
      await sharePeople(ada, id, { emails: [bob.email], permission: 'view' }).expect(201);
      const res = await sharePeople(ada, id, {
        emails: [bob.email, carol.email],
        permission: 'comment',
        versionNo: 1,
      }).expect(201);
      expect(accessOf(res).people.map((p) => [p.user.id, p.permission, p.pinnedVersionNo])).toEqual(
        [
          [bob.id, 'comment', 1],
          [carol.id, 'comment', 1],
        ],
      );
    });

    it("changes one person's permission or version", async () => {
      const id = await twoVersions();
      await sharePeople(ada, id, { emails: [bob.email], permission: 'view' }).expect(201);

      let access = accessOf(await updatePerson(ada, id, bob.id, { permission: 'comment' }));
      expect(access.people[0]).toMatchObject({ permission: 'comment', pinnedVersionNo: null });
      access = accessOf(await updatePerson(ada, id, bob.id, { versionNo: 1 }).expect(200));
      expect(access.people[0]).toMatchObject({ permission: 'comment', pinnedVersionNo: 1 });
      expect(await versionNos(bob, id)).toEqual([1]);

      await updatePerson(ada, id, carol.id, { permission: 'view' }).expect(404);
      await updatePerson(ada, id, bob.id, {}).expect(400);
    });

    it('removing someone takes their access away at once', async () => {
      const id = await publish(ada);
      await sharePeople(ada, id, { emails: [bob.email], permission: 'view' }).expect(201);
      await get(bob, id).expect(200);

      expect(accessOf(await removePerson(ada, id, bob.id).expect(200)).people).toEqual([]);
      await get(bob, id).expect(404);
      expect(await listed(bob, 'shared', [id])).toEqual([]);
      // Removing again is harmless.
      await removePerson(ada, id, bob.id).expect(200);
      await removePerson(ada, id, 'not-a-uuid').expect(200);
    });

    it('drops deleted artifacts from Shared with me', async () => {
      const id = await publish(ada);
      await sharePeople(ada, id, { emails: [bob.email], permission: 'view' }).expect(201);
      await send('delete', ada, `/artifacts/${id}`).expect(204);
      await get(bob, id).expect(404);
      expect(await listed(bob, 'shared', [id])).toEqual([]);
    });
  });

  describe('versions across access', () => {
    it('shows every version if any access a user has is unpinned', async () => {
      const id = await twoVersions();
      await setCompany(ada, id, { enabled: true, versionNo: 1 }).expect(200);
      expect(await versionNos(bob, id)).toEqual([1]);

      await sharePeople(ada, id, { emails: [bob.email], permission: 'view' }).expect(201);
      expect(await versionNos(bob, id)).toEqual([2, 1]);
      // Carol still sees only the company's pinned version.
      expect(await versionNos(carol, id)).toEqual([1]);
    });

    it('shows the newest pinned version as current when all access is pinned', async () => {
      const id = await twoVersions();
      await addVersion(ada, id, fixtures.svg);
      await setCompany(ada, id, { enabled: true, versionNo: 1 }).expect(200);
      await sharePeople(ada, id, { emails: [bob.email], permission: 'view', versionNo: 2 });

      expect(await versionNos(bob, id)).toEqual([2, 1]);
      expect(await artifactAs(bob, id)).toMatchObject({
        latestVersionNo: 2,
        currentVersion: { versionNo: 2 },
      });
      await content(bob, id, 3).expect(404);
    });
  });

  describe('user search', () => {
    it('finds other users by the start of their email or name', async () => {
      const zed = await users.create(`Zedekiah ${randomUUID().slice(0, 6)}`);
      const byName = userSearchResponseSchema.parse(
        (await search(ada, zed.displayName.slice(0, 12)).expect(200)).body,
      );
      expect(byName.items).toEqual([
        { id: zed.id, displayName: zed.displayName, email: zed.email },
      ]);

      const byEmail = userSearchResponseSchema.parse(
        (await search(ada, zed.email.slice(0, 13)).expect(200)).body,
      );
      expect(byEmail.items.map((user) => user.id)).toEqual([zed.id]);

      // Never the caller, nor matches in the middle.
      expect(userSearchResponseSchema.parse((await search(zed, zed.email)).body).items).toEqual([]);
      const middle = zed.displayName.slice(3, 12);
      expect(userSearchResponseSchema.parse((await search(ada, middle)).body).items).toEqual([]);
    });

    it('returns at most five users, needs three characters and treats wildcards literally', async () => {
      const many = userSearchResponseSchema.parse((await search(ada, 'user-').expect(200)).body);
      expect(many.items.length).toBeLessThanOrEqual(5);
      expect(errorOf(await search(ada, 'ab').expect(400)).code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(userSearchResponseSchema.parse((await search(ada, '%%%')).body).items).toEqual([]);
      expect(userSearchResponseSchema.parse((await search(ada, '___')).body).items).toEqual([]);
    });

    it('requires a session', async () => {
      await http().get('/api/users/search').query({ q: 'user' }).expect(401);
    });

    describe('rate limit', () => {
      let limited: NestExpressApplication;
      let limitedUsers: ReturnType<typeof testUsers>;

      beforeAll(async () => {
        limited = await createTestApp({ env: { RATE_LIMIT_USER_SEARCH_PER_MINUTE: 2 } });
        limitedUsers = testUsers(limited, 'sharing-limit');
      });

      afterAll(async () => {
        await limitedUsers.cleanup();
        await limited.close();
      });

      const searchAs = (user: TestUser) =>
        request(limited.getHttpServer())
          .get('/api/users/search')
          .query({ q: 'someone' })
          .set('Cookie', user.cookie);

      it('is counted per user', async () => {
        const [first, second] = [await limitedUsers.create(), await limitedUsers.create()];
        await searchAs(first).expect(200);
        await searchAs(first).expect(200);
        expect(errorOf(await searchAs(first).expect(429)).code).toBe(ErrorCode.RATE_LIMITED);
        await searchAs(second).expect(200);
      });
    });
  });
});
