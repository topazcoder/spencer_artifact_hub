import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorBodySchema,
  artifactResponseSchema,
  commentListResponseSchema,
  commentResponseSchema,
  ErrorCode,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { createTestApp } from './create-test-app.js';
import { fixtures } from './fixtures/content.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

function errorOf(res: Response) {
  return apiErrorBodySchema.parse(res.body).error;
}

describe('Comments (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let bob: TestUser;
  let carol: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app, 'comments');
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

  function send(method: 'put' | 'post' | 'patch' | 'delete', user: TestUser, path: string) {
    return http()[method](`/api${path}`).set('Origin', TEST_ORIGIN).set('Cookie', user.cookie);
  }

  /** A private artifact of Ada's with `versions` versions. */
  async function publish(versions = 1): Promise<string> {
    const res = await send('post', ada, '/artifacts')
      .field('metadata', JSON.stringify({ title: 'Pricing page' }))
      .attach('file', fixtures.html, 'pricing.html')
      .expect(201);
    const id = artifactResponseSchema.parse(res.body).artifact.id;
    for (let no = 2; no <= versions; no++) {
      await send('post', ada, `/artifacts/${id}/versions`)
        .field('metadata', '{}')
        .attach('file', fixtures.markdown, 'notes.md')
        .expect(201);
    }
    return id;
  }

  const shareWith = (user: TestUser, id: string, permission: string, versionNo?: number) =>
    send('post', ada, `/artifacts/${id}/access/people`)
      .send({ emails: [user.email], permission, versionNo: versionNo ?? null })
      .expect(201);

  const post = (user: TestUser, id: string, body: object) =>
    send('post', user, `/artifacts/${id}/comments`).send(body);
  const patch = (user: TestUser, commentId: string, body: object) =>
    send('patch', user, `/comments/${commentId}`).send(body);
  const remove = (user: TestUser, commentId: string) =>
    send('delete', user, `/comments/${commentId}`);
  const list = (user: TestUser, id: string, query: object = {}) =>
    http().get(`/api/artifacts/${id}/comments`).query(query).set('Cookie', user.cookie);

  async function comment(user: TestUser, id: string, body: object) {
    return commentResponseSchema.parse((await post(user, id, body).expect(201)).body).comment;
  }

  async function threads(user: TestUser, id: string, query: object = {}) {
    return commentListResponseSchema.parse((await list(user, id, query).expect(200)).body).items;
  }

  describe('posting', () => {
    it('comments on the latest version by default, as plain trimmed text', async () => {
      const id = await publish(2);
      const posted = await comment(ada, id, { body: '  The <b>header</b> looks off \n' });
      expect(posted).toMatchObject({
        versionNo: 2,
        parentId: null,
        author: { id: ada.id, displayName: 'Ada' },
        body: 'The <b>header</b> looks off',
        resolvedAt: null,
        editedAt: null,
        permissions: { edit: true, delete: true, resolve: true },
      });

      expect(await threads(ada, id)).toEqual([{ ...posted, replies: [] }]);
    });

    it('comments on an earlier version when asked', async () => {
      const id = await publish(2);
      expect(await comment(ada, id, { body: 'On v1', versionNo: 1 })).toMatchObject({
        versionNo: 1,
      });
      const error = errorOf(await post(ada, id, { body: 'On v3', versionNo: 3 }).expect(400));
      expect(error.details).toEqual([{ path: 'versionNo', message: 'There is no version 3.' }]);
    });

    it('rejects an empty or too long body', async () => {
      const id = await publish();
      await post(ada, id, { body: '   ' }).expect(400);
      await post(ada, id, { body: 'x'.repeat(5001) }).expect(400);
      await post(ada, id, {}).expect(400);
    });

    it('requires a same-origin request', async () => {
      const id = await publish();
      await post(ada, id, { body: 'Hi' }).set('Origin', 'https://evil.example').expect(403);
      expect(await threads(ada, id)).toEqual([]);
    });
  });

  describe('replies', () => {
    it('nest one level deep under their comment, oldest first, on its version', async () => {
      const id = await publish(2);
      await shareWith(bob, id, 'comment');
      const first = await comment(ada, id, { body: 'On v1', versionNo: 1 });
      const second = await comment(bob, id, { body: 'On v2' });
      const reply = await comment(bob, id, { body: 'Agreed', parentId: first.id });
      const another = await comment(ada, id, { body: 'Fixed', parentId: first.id });

      expect(reply).toMatchObject({
        versionNo: 1,
        parentId: first.id,
        permissions: { edit: true, delete: true, resolve: false },
      });
      const items = await threads(bob, id);
      expect(items.map((thread) => thread.id)).toEqual([first.id, second.id]);
      expect(items[0]?.replies.map((r) => r.id)).toEqual([reply.id, another.id]);
      expect(items[1]?.replies).toEqual([]);
    });

    it("can't reply to a reply, nor be on another version than their comment", async () => {
      const id = await publish(2);
      const top = await comment(ada, id, { body: 'Top', versionNo: 1 });
      const reply = await comment(ada, id, { body: 'Reply', parentId: top.id });

      const nested = errorOf(
        await post(ada, id, { body: 'Deeper', parentId: reply.id }).expect(400),
      );
      expect(nested.details).toEqual([
        { path: 'parentId', message: 'Reply to the top-level comment: replies have no replies.' },
      ]);
      const elsewhere = errorOf(
        await post(ada, id, { body: 'On v2', parentId: top.id, versionNo: 2 }).expect(400),
      );
      expect(elsewhere.details).toEqual([
        { path: 'versionNo', message: 'A reply is on the same version as its comment.' },
      ]);
      await comment(ada, id, { body: 'Same version', parentId: top.id, versionNo: 1 });
    });

    it('must reply to a comment on the same artifact', async () => {
      const [one, two] = await Promise.all([publish(), publish()]);
      const top = await comment(ada, one, { body: 'On one' });
      await post(ada, two, { body: 'Reply', parentId: top.id }).expect(404);
      await post(ada, two, {
        body: 'Reply',
        parentId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
    });
  });

  describe('who can read and write', () => {
    it('gives nothing to people without access: 404 everywhere', async () => {
      const id = await publish();
      const posted = await comment(ada, id, { body: 'Private note' });
      for (const attempt of [
        () => list(bob, id),
        () => post(bob, id, { body: 'Hi' }),
        () => patch(bob, posted.id, { body: 'Hijacked' }),
        () => patch(bob, posted.id, { resolved: true }),
        () => remove(bob, posted.id),
      ]) {
        await attempt().expect(404);
      }
    });

    it('lets view-only people read but not post (403)', async () => {
      const id = await publish();
      await shareWith(bob, id, 'view');
      const posted = await comment(ada, id, { body: 'For the team' });

      expect(await threads(bob, id)).toMatchObject([
        { id: posted.id, permissions: { edit: false, delete: false, resolve: false } },
      ]);
      expect(errorOf(await post(bob, id, { body: 'Hi' }).expect(403)).code).toBe(
        ErrorCode.FORBIDDEN,
      );
      await post(bob, id, { body: 'Reply', parentId: posted.id }).expect(403);
    });

    it('lets everyone at the company comment on a public artifact', async () => {
      const id = await publish();
      await send('put', ada, `/artifacts/${id}/access/company`).send({ enabled: true }).expect(200);
      await comment(carol, id, { body: 'From Carol' });
      expect((await threads(bob, id)).map((thread) => thread.body)).toEqual(['From Carol']);
    });

    it('takes effect at once when access is removed', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Mine' });
      await send('delete', ada, `/artifacts/${id}/access/people/${bob.id}`).expect(200);

      await list(bob, id).expect(404);
      await patch(bob, posted.id, { body: 'Edited' }).expect(404);
      await remove(bob, posted.id).expect(404);
    });

    it('hides the comments of a deleted artifact', async () => {
      const id = await publish();
      const posted = await comment(ada, id, { body: 'Soon gone' });
      await send('delete', ada, `/artifacts/${id}`).expect(204);
      await list(ada, id).expect(404);
      await patch(ada, posted.id, { body: 'Edited' }).expect(404);
    });
  });

  describe('versions', () => {
    it('lists one version, or every version', async () => {
      const id = await publish(2);
      await comment(ada, id, { body: 'On v1', versionNo: 1 });
      await comment(ada, id, { body: 'On v2' });

      expect((await threads(ada, id)).map((t) => t.body)).toEqual(['On v1', 'On v2']);
      expect((await threads(ada, id, { version: 1 })).map((t) => t.body)).toEqual(['On v1']);
      expect(errorOf(await list(ada, id, { version: 3 }).expect(404)).message).toBe(
        'Version not found.',
      );
      await list(ada, id, { version: 'latest' }).expect(400);
    });

    it('show people limited to a pinned version only the comments on it', async () => {
      const id = await publish(2);
      await shareWith(bob, id, 'comment', 1);
      const onV1 = await comment(ada, id, { body: 'On v1', versionNo: 1 });
      const onV2 = await comment(ada, id, { body: 'On v2' });

      expect((await threads(bob, id)).map((t) => t.id)).toEqual([onV1.id]);
      await list(bob, id, { version: 2 }).expect(404);
      // Bob's default is the newest version he can see.
      expect(await comment(bob, id, { body: 'From Bob' })).toMatchObject({ versionNo: 1 });
      await post(bob, id, { body: 'On v2', versionNo: 2 }).expect(400);
      await post(bob, id, { body: 'Reply', parentId: onV2.id }).expect(404);
    });

    it("hide a pinned viewer's own comments on versions they no longer see", async () => {
      const id = await publish(2);
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'On v2' });
      await send('patch', ada, `/artifacts/${id}/access/people/${bob.id}`)
        .send({ versionNo: 1 })
        .expect(200);

      expect(await threads(bob, id)).toEqual([]);
      await patch(bob, posted.id, { body: 'Edited' }).expect(404);
    });
  });

  describe('resolving', () => {
    it('is for the author of a top-level comment, who can reopen it too', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Logo is blurry' });

      const resolved = commentResponseSchema.parse(
        (await patch(bob, posted.id, { resolved: true }).expect(200)).body,
      ).comment;
      expect(resolved.resolvedAt).not.toBeNull();
      // Resolving again keeps the original time.
      const again = await patch(bob, posted.id, { resolved: true }).expect(200);
      expect(commentResponseSchema.parse(again.body).comment.resolvedAt).toBe(resolved.resolvedAt);

      const reopened = await patch(bob, posted.id, { resolved: false }).expect(200);
      expect(commentResponseSchema.parse(reopened.body).comment.resolvedAt).toBeNull();
    });

    it('is refused to anyone else, the artifact owner included (403)', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Logo is blurry' });
      const error = errorOf(await patch(ada, posted.id, { resolved: true }).expect(403));
      expect(error).toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: 'Only its author can change this comment.',
      });
    });

    it('is not for replies', async () => {
      const id = await publish();
      const top = await comment(ada, id, { body: 'Top' });
      const reply = await comment(ada, id, { body: 'Reply', parentId: top.id });
      const error = errorOf(await patch(ada, reply.id, { resolved: true }).expect(400));
      expect(error.details).toEqual([
        { path: 'resolved', message: 'Only top-level comments can be resolved.' },
      ]);
    });

    it('can leave out resolved threads', async () => {
      const id = await publish();
      const done = await comment(ada, id, { body: 'Done' });
      const open = await comment(ada, id, { body: 'Open' });
      await patch(ada, done.id, { resolved: true }).expect(200);

      expect((await threads(ada, id, { include: 'open' })).map((t) => t.id)).toEqual([open.id]);
      expect((await threads(ada, id, { include: 'all' })).map((t) => t.id)).toEqual([
        done.id,
        open.id,
      ]);
    });
  });

  describe('editing', () => {
    it('is for the author, and marks the comment as edited', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Typo' });

      await patch(ada, posted.id, { body: 'Not yours' }).expect(403);
      const edited = commentResponseSchema.parse(
        (await patch(bob, posted.id, { body: ' Fixed ' }).expect(200)).body,
      ).comment;
      expect(edited).toMatchObject({ body: 'Fixed', resolvedAt: null });
      expect(edited.editedAt).not.toBeNull();
      expect((await threads(ada, id))[0]?.body).toBe('Fixed');

      // The same body changes nothing.
      const same = await patch(bob, posted.id, { body: 'Fixed' }).expect(200);
      expect(commentResponseSchema.parse(same.body).comment.editedAt).toBe(edited.editedAt);
    });

    it('rejects anything but a body or resolved', async () => {
      const id = await publish();
      const posted = await comment(ada, id, { body: 'Hi' });
      await patch(ada, posted.id, {}).expect(400);
      await patch(ada, posted.id, { body: '' }).expect(400);
      await patch(ada, posted.id, { versionNo: 2 }).expect(400);
      await patch(ada, 'not-an-id', { body: 'Hi' }).expect(404);
    });

    it('stops when the author can only view, but they can still delete', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Mine' });
      await shareWith(bob, id, 'view');

      expect((await threads(bob, id))[0]?.permissions).toEqual({
        edit: false,
        delete: true,
        resolve: false,
      });
      const error = errorOf(await patch(bob, posted.id, { body: 'Edited' }).expect(403));
      expect(error.message).toBe("You can't comment on this artifact anymore.");
      await patch(bob, posted.id, { resolved: true }).expect(403);
      await remove(bob, posted.id).expect(204);
    });
  });

  describe('deleting', () => {
    it('is for the author only', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const posted = await comment(bob, id, { body: 'Mine' });
      await remove(ada, posted.id).expect(403);
      await remove(bob, posted.id).expect(204);
      expect(await threads(ada, id)).toEqual([]);
    });

    it('hides a reply, and a whole thread when its top-level comment goes', async () => {
      const id = await publish();
      await shareWith(bob, id, 'comment');
      const top = await comment(ada, id, { body: 'Top' });
      const kept = await comment(bob, id, { body: 'Kept', parentId: top.id });
      const gone = await comment(ada, id, { body: 'Gone', parentId: top.id });

      await remove(ada, gone.id).expect(204);
      expect((await threads(ada, id))[0]?.replies.map((r) => r.id)).toEqual([kept.id]);

      await remove(ada, top.id).expect(204);
      expect(await threads(bob, id)).toEqual([]);
      // Neither the deleted comment nor the replies it took along can be changed or answered.
      await remove(ada, top.id).expect(404);
      await patch(bob, kept.id, { body: 'Edited' }).expect(404);
      await remove(bob, kept.id).expect(404);
      await post(bob, id, { body: 'Reply', parentId: top.id }).expect(404);
    });
  });
});
