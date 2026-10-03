import { describe, expect, it } from 'vitest';
import { loginRequestSchema, signupRequestSchema } from './auth.js';

describe('signupRequestSchema', () => {
  const valid = { email: 'ada@example.com', password: 'correct horse', displayName: 'Ada' };

  it('normalizes email and display name', () => {
    expect(
      signupRequestSchema.parse({ ...valid, email: '  Ada@Example.COM ', displayName: ' Ada ' }),
    ).toEqual(valid);
  });

  it.each([
    ['email', { email: 'not-an-email' }],
    ['password', { password: 'short' }],
    ['password', { password: 'x'.repeat(129) }],
    ['displayName', { displayName: '   ' }],
  ])('rejects an invalid %s', (field, override) => {
    const result = signupRequestSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe('loginRequestSchema', () => {
  it('accepts passwords shorter than the signup minimum', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('requires a password', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
