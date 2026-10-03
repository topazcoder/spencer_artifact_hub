import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorBodySchema, authResponseSchema, ErrorCode } from '@artifact-hub/shared';
import request, { type Response } from 'supertest';
import { DataSource } from 'typeorm';
import { SESSION_COOKIE } from '../src/auth/sessions/session-cookie.service.js';
import { hashSessionToken } from '../src/auth/sessions/sessions.service.js';
import { createTestApp } from './create-test-app.js';
import { TEST_ORIGIN } from './test-env.js';

const PASSWORD = 'correct horse battery';
// Unique per run, so the suite can clean up after itself without touching other data.
const EMAIL_DOMAIN = `auth-${randomUUID().slice(0, 8)}.e2e.test`;

function newEmail(): string {
  return `user-${randomUUID().slice(0, 8)}@${EMAIL_DOMAIN}`;
}

/** The `ah_session` Set-Cookie header of a response, if any. */
function sessionSetCookie(res: Response): string | undefined {
  const headers = res.headers['set-cookie'] as unknown as string[] | undefined;
  return headers?.find((header) => header.startsWith(`${SESSION_COOKIE}=`));
}

function sessionToken(res: Response): string {
  const header = sessionSetCookie(res);
  const token = header?.split(';')[0]?.slice(SESSION_COOKIE.length + 1);
  if (!token) throw new Error('Response did not set a session cookie');
  return token;
}

function cookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

function errorCode(res: Response): string {
  return apiErrorBodySchema.parse(res.body).error.code;
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let db: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE email LIKE $1', [`%@${EMAIL_DOMAIN}`]);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  function signup(body: Record<string, unknown>) {
    return http().post('/api/auth/signup').set('Origin', TEST_ORIGIN).send(body);
  }

  function login(email: string, password: string, token?: string) {
    const req = http().post('/api/auth/login').set('Origin', TEST_ORIGIN);
    if (token) req.set('Cookie', cookie(token));
    return req.send({ email, password });
  }

  function me(token: string) {
    return http().get('/api/auth/me').set('Cookie', cookie(token));
  }

  function logoutWith(token: string, headers: Record<string, string>) {
    return http().post('/api/auth/logout').set('Cookie', cookie(token)).set(headers);
  }

  /** Signs up a fresh user and returns its email and session token. */
  async function newUser() {
    const email = newEmail();
    const res = await signup({ email, password: PASSWORD, displayName: 'Ada' }).expect(201);
    return { email, token: sessionToken(res), userId: authResponseSchema.parse(res.body).user.id };
  }

  describe('POST /api/auth/signup', () => {
    it('creates the account, logs it in and returns the user', async () => {
      const email = newEmail();
      const res = await signup({
        email: `  ${email.toUpperCase()} `,
        password: PASSWORD,
        displayName: ' Ada Lovelace ',
      }).expect(201);

      const { user } = authResponseSchema.parse(res.body);
      expect(user).toMatchObject({ email, displayName: 'Ada Lovelace' });
      expect(res.body.user).not.toHaveProperty('passwordHash');

      const setCookie = sessionSetCookie(res);
      expect(setCookie).toMatch(/HttpOnly/);
      expect(setCookie).toMatch(/SameSite=Lax/);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).toMatch(/Expires=/);
      expect(setCookie).not.toMatch(/Secure/); // COOKIE_SECURE defaults to false outside production

      const meRes = await me(sessionToken(res)).expect(200);
      expect(authResponseSchema.parse(meRes.body).user).toEqual(user);
    });

    it('stores an argon2id hash, never the password', async () => {
      const { userId } = await newUser();
      const [row] = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.password_hash).not.toContain(PASSWORD);
    });

    it('rejects an email that is already registered, ignoring case', async () => {
      const { email } = await newUser();
      const res = await signup({
        email: email.toUpperCase(),
        password: PASSWORD,
        displayName: 'Copy',
      }).expect(409);
      expect(errorCode(res)).toBe(ErrorCode.CONFLICT);
    });

    it('validates the body with the shared schema', async () => {
      const res = await signup({ email: 'nope', password: 'short' }).expect(400);
      const { error } = apiErrorBodySchema.parse(res.body);
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'email' }),
          expect.objectContaining({ path: 'password' }),
          expect.objectContaining({ path: 'displayName' }),
        ]),
      );
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with the right password and issues a new session', async () => {
      const { email, token: signupToken } = await newUser();
      const res = await login(email.toUpperCase(), PASSWORD).expect(200);
      const token = sessionToken(res);
      expect(token).not.toBe(signupToken);
      expect(authResponseSchema.parse(res.body).user.email).toBe(email);
      await me(token).expect(200);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const { email } = await newUser();
      const wrongPassword = await login(email, 'wrong password').expect(401);
      const unknownEmail = await login(newEmail(), PASSWORD).expect(401);

      const { requestId: _a, ...wrongPasswordError } = wrongPassword.body.error;
      const { requestId: _b, ...unknownEmailError } = unknownEmail.body.error;
      expect(wrongPasswordError).toEqual(unknownEmailError);
      expect(errorCode(wrongPassword)).toBe(ErrorCode.UNAUTHENTICATED);
      expect(sessionSetCookie(wrongPassword)).toBeUndefined();
    });

    it("revokes the browser's previous session", async () => {
      const { email, token: previous } = await newUser();
      await login(email, PASSWORD, previous).expect(200);
      await me(previous).expect(401);
    });
  });

  describe('sessions', () => {
    it('stores only the SHA-256 of the token', async () => {
      const { token, userId } = await newUser();
      const rows = await db.query('SELECT token_hash FROM sessions WHERE user_id = $1', [userId]);
      expect(rows).toEqual([{ token_hash: hashSessionToken(token) }]);
    });

    it('rejects requests without a session', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(errorCode(res)).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('rejects an unknown token and clears the cookie', async () => {
      const res = await me('not-a-real-token').expect(401);
      expect(sessionSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('rejects an expired session', async () => {
      const { token } = await newUser();
      await db.query(
        "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
        [hashSessionToken(token)],
      );
      await me(token).expect(401);
    });

    it('extends the session of an active user and re-sends the cookie', async () => {
      const { token } = await newUser();
      const tokenHash = hashSessionToken(token);

      // Just created: no write, no new cookie.
      expect(sessionSetCookie(await me(token).expect(200))).toBeUndefined();

      await db.query(
        `UPDATE sessions SET last_seen_at = now() - interval '10 minutes',
                             expires_at = now() + interval '1 hour'
         WHERE token_hash = $1`,
        [tokenHash],
      );
      const res = await me(token).expect(200);
      expect(sessionToken(res)).toBe(token);

      const [row] = await db.query(
        "SELECT expires_at > now() + interval '6 days' AS extended FROM sessions WHERE token_hash = $1",
        [tokenHash],
      );
      expect(row.extended).toBe(true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('deletes the session and clears the cookie', async () => {
      const { token } = await newUser();
      const res = await logoutWith(token, { Origin: TEST_ORIGIN }).expect(204);
      expect(sessionSetCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await me(token).expect(401);
      const rows = await db.query('SELECT 1 FROM sessions WHERE token_hash = $1', [
        hashSessionToken(token),
      ]);
      expect(rows).toHaveLength(0);
    });

    it('succeeds without a session', async () => {
      await http().post('/api/auth/logout').set('Origin', TEST_ORIGIN).expect(204);
    });
  });

  describe('CSRF origin check', () => {
    it.each([
      ['a foreign Origin', { Origin: 'https://evil.test' }],
      ['Origin: null', { Origin: 'null' }],
      ['a foreign Referer', { Referer: 'https://evil.test/page' }],
      ['neither Origin nor Referer', {}],
    ])('rejects a cookie-authenticated request with %s', async (_label, headers) => {
      const { token } = await newUser();
      const res = await logoutWith(token, headers);
      expect(res.status).toBe(403);
      expect(errorCode(res)).toBe(ErrorCode.FORBIDDEN);
      await me(token).expect(200); // the session survived
    });

    it('accepts a same-origin Referer when Origin is absent', async () => {
      const { token } = await newUser();
      await logoutWith(token, { Referer: `${TEST_ORIGIN}/settings` }).expect(204);
    });

    it('lets a client without cookies or Origin sign up (e.g. curl)', async () => {
      await http()
        .post('/api/auth/signup')
        .send({ email: newEmail(), password: PASSWORD, displayName: 'Curl' })
        .expect(201);
    });
  });
});

describe('Auth rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      env: { RATE_LIMIT_LOGIN_PER_EMAIL: 2, RATE_LIMIT_LOGIN_PER_IP: 4 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function login(email: string) {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email, password: 'wrong password' });
  }

  it('limits attempts per email, then per IP', async () => {
    const target = newEmail();
    await login(target).expect(401);
    await login(target).expect(401);
    const perEmail = await login(target).expect(429);
    expect(errorCode(perEmail)).toBe(ErrorCode.RATE_LIMITED);

    // Blocked attempts still count for the IP: 3 so far, so a different email gets one more.
    await login(newEmail()).expect(401);
    const perIp = await login(newEmail()).expect(429);
    expect(errorCode(perIp)).toBe(ErrorCode.RATE_LIMITED);
  });
});
