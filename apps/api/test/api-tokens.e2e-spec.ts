import { Controller, Get, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  API_TOKENS_MAX,
  apiErrorBodySchema,
  apiTokenListResponseSchema,
  createApiTokenResponseSchema,
  ErrorCode,
} from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { Auth, CurrentActor } from '../src/auth/auth.decorators.js';
import type { Actor } from '../src/auth/auth.types.js';
import { hashSecretToken } from '../src/common/tokens/secret-tokens.js';
import { createTestApp } from './create-test-app.js';
import { TEST_ORIGIN } from './test-env.js';
import { type TestUser, testUsers } from './test-users.js';

/** Stands in for the MCP endpoint until it exists. */
@Controller('test-bearer')
class BearerTestController {
  @Auth('api_token')
  @Get()
  whoAmI(@CurrentActor() actor: Actor) {
    return actor;
  }

  @Auth('api_token')
  @Post()
  change(@CurrentActor() actor: Actor) {
    return actor;
  }
}

function errorCode(res: Response): string {
  return apiErrorBodySchema.parse(res.body).error.code;
}

describe('API tokens (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let users: ReturnType<typeof testUsers>;
  let ada: TestUser;
  let grace: TestUser;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [BearerTestController] });
    db = app.get(DataSource);
    users = testUsers(app, 'api-tokens');
    ada = await users.create('Ada');
    grace = await users.create('Grace');
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function createToken(user: TestUser, name = 'Claude Desktop') {
    return http().post('/api/tokens').set('Cookie', user.cookie).set('Origin', TEST_ORIGIN).send({
      name,
    });
  }

  async function newToken(user: TestUser, name?: string) {
    return createApiTokenResponseSchema.parse((await createToken(user, name).expect(201)).body);
  }

  function listTokens(user: TestUser) {
    return http().get('/api/tokens').set('Cookie', user.cookie);
  }

  function revoke(user: TestUser, id: string) {
    return http().delete(`/api/tokens/${id}`).set('Cookie', user.cookie).set('Origin', TEST_ORIGIN);
  }

  function withBearer(secret: string) {
    return http().get('/api/test-bearer').set('Authorization', `Bearer ${secret}`);
  }

  describe('creating and listing', () => {
    it('returns the secret once, and lists the token without it', async () => {
      const { token, secret } = await newToken(ada, '  Laptop  ');
      expect(secret).toMatch(/^ah_[A-Za-z0-9_-]{43}$/);
      expect(token).toMatchObject({ name: 'Laptop', prefix: secret.slice(0, 8), lastUsedAt: null });

      const { items } = apiTokenListResponseSchema.parse((await listTokens(ada).expect(200)).body);
      expect(items[0]).toEqual(token);
      expect(JSON.stringify(items)).not.toContain(secret);
    });

    it('stores only the SHA-256 of the token', async () => {
      const { token, secret } = await newToken(ada);
      const rows = await db.query('SELECT token_hash FROM api_tokens WHERE id = $1', [token.id]);
      expect(rows).toEqual([{ token_hash: hashSecretToken(secret) }]);
    });

    it("lists only the caller's live tokens, newest first", async () => {
      const first = await newToken(grace, 'First');
      const second = await newToken(grace, 'Second');
      const revoked = await newToken(grace, 'Revoked');
      await revoke(grace, revoked.token.id).expect(204);

      const { items } = apiTokenListResponseSchema.parse(
        (await listTokens(grace).expect(200)).body,
      );
      expect(items.map((t) => t.id)).toEqual([second.token.id, first.token.id]);
    });

    it('validates the name', async () => {
      const res = await createToken(ada, '   ').expect(400);
      expect(errorCode(res)).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it(`allows at most ${API_TOKENS_MAX} live tokens`, async () => {
      const user = await users.create('Many tokens');
      for (let i = 0; i < API_TOKENS_MAX; i++) await newToken(user, `Token ${i}`);
      expect(errorCode(await createToken(user).expect(409))).toBe(ErrorCode.CONFLICT);

      const { items } = apiTokenListResponseSchema.parse((await listTokens(user).expect(200)).body);
      await revoke(user, items[0]!.id).expect(204);
      await createToken(user).expect(201);
    });

    it('needs a session, not an API token', async () => {
      const { secret } = await newToken(ada);
      await http().get('/api/tokens').set('Authorization', `Bearer ${secret}`).expect(401);
      await http()
        .post('/api/tokens')
        .set('Authorization', `Bearer ${secret}`)
        .send({ name: 'Escalation' })
        .expect(401);
    });
  });

  describe('Bearer authentication', () => {
    it('authenticates as the owner, via MCP', async () => {
      const { secret } = await newToken(ada);
      const res = await withBearer(secret).expect(200);
      expect(res.body).toEqual({ userId: ada.id, via: 'mcp' });
    });

    it('accepts state-changing requests without Origin (non-browser clients)', async () => {
      const { secret } = await newToken(ada);
      await http().post('/api/test-bearer').set('Authorization', `Bearer ${secret}`).expect(201);
    });

    it('records when the token was last used', async () => {
      const { token, secret } = await newToken(ada);
      await withBearer(secret).expect(200);
      const { items } = apiTokenListResponseSchema.parse((await listTokens(ada).expect(200)).body);
      expect(items.find((t) => t.id === token.id)?.lastUsedAt).not.toBeNull();
    });

    it.each([
      ['no Authorization header', undefined],
      ['another scheme', 'Basic dXNlcjpwYXNz'],
      ['a malformed token', 'Bearer ah_short'],
      ['an unknown token', `Bearer ah_${'x'.repeat(43)}`],
    ])('rejects %s', async (_label, header) => {
      const req = http().get('/api/test-bearer');
      if (header) req.set('Authorization', header);
      expect(errorCode(await req.expect(401))).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('rejects a session cookie on a Bearer route', async () => {
      await http().get('/api/test-bearer').set('Cookie', ada.cookie).expect(401);
    });

    it('stops working as soon as the token is revoked', async () => {
      const { token, secret } = await newToken(ada);
      await withBearer(secret).expect(200);
      await revoke(ada, token.id).expect(204);
      await withBearer(secret).expect(401);
      await revoke(ada, token.id).expect(204); // revoking again does nothing
    });

    it("can't be revoked by someone else", async () => {
      const { token, secret } = await newToken(ada);
      expect(errorCode(await revoke(grace, token.id).expect(404))).toBe(ErrorCode.NOT_FOUND);
      await revoke(grace, 'not-a-uuid').expect(404);
      await withBearer(secret).expect(200);
    });
  });
});

describe('API token rate limiting (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [BearerTestController],
      env: { RATE_LIMIT_API_TOKEN_PER_MINUTE: 2 },
    });
    users = testUsers(app, 'api-tokens-limit');
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  async function secretOf(owner: TestUser): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/tokens')
      .set('Cookie', owner.cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Token' })
      .expect(201);
    return createApiTokenResponseSchema.parse(res.body).secret;
  }

  function call(secret: string) {
    return request(app.getHttpServer())
      .get('/api/test-bearer')
      .set('Authorization', `Bearer ${secret}`);
  }

  it('limits requests per user, across their tokens', async () => {
    const user = await users.create();
    const other = await users.create();
    const [first, second, third] = [
      await secretOf(user),
      await secretOf(user),
      await secretOf(other),
    ];
    await call(first).expect(200);
    await call(second).expect(200);
    expect(errorCode(await call(first).expect(429))).toBe(ErrorCode.RATE_LIMITED);
    await call(third).expect(200);
  });
});
