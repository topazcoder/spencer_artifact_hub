import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { authResponseSchema } from '@artifact-hub/shared';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SESSION_COOKIE } from '../src/auth/sessions/session-cookie.service.js';
import { TEST_ORIGIN } from './test-env.js';

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  /** `Cookie` header value carrying the user's session. */
  cookie: string;
}

/**
 * Signs up users under one email domain unique to a suite, so `cleanup()` removes exactly
 * what the suite created (artifacts and versions go with their owner).
 */
export function testUsers(app: INestApplication, suite: string) {
  const domain = `${suite}-${randomUUID().slice(0, 8)}.e2e.test`;

  return {
    async create(displayName = 'Test User'): Promise<TestUser> {
      const email = `user-${randomUUID().slice(0, 8)}@${domain}`;
      const res = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({ email, password: 'correct horse battery', displayName })
        .expect(201);
      const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((header) =>
        header.startsWith(`${SESSION_COOKIE}=`),
      );
      if (!setCookie) throw new Error('Signup did not set a session cookie');
      const { user } = authResponseSchema.parse(res.body);
      return { id: user.id, email, displayName, cookie: setCookie.split(';')[0] ?? '' };
    },

    async cleanup(): Promise<void> {
      await app.get(DataSource).query('DELETE FROM users WHERE email LIKE $1', [`%@${domain}`]);
    },
  };
}
