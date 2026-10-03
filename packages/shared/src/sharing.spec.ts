import { describe, expect, it } from 'vitest';
import {
  setCompanyAccessRequestSchema,
  sharePeopleRequestSchema,
  updatePersonAccessRequestSchema,
  userSearchQuerySchema,
} from './sharing.js';

describe('sharePeopleRequestSchema', () => {
  it('normalizes and de-duplicates emails, and defaults to the latest version', () => {
    expect(
      sharePeopleRequestSchema.parse({
        emails: [' Sara@Example.com ', 'sara@example.com', 'tom@example.com'],
        permission: 'comment',
      }),
    ).toEqual({
      emails: ['sara@example.com', 'tom@example.com'],
      permission: 'comment',
      versionNo: null,
    });
  });

  it.each([
    [{ emails: [], permission: 'view' }, 'emails'],
    [{ emails: ['not an email'], permission: 'view' }, 'emails.0'],
    [{ emails: Array.from({ length: 21 }, (_, i) => `u${i}@x.io`), permission: 'view' }, 'emails'],
    [{ emails: ['a@x.io'], permission: 'edit' }, 'permission'],
    [{ emails: ['a@x.io'], permission: 'view', versionNo: 0 }, 'versionNo'],
  ])('rejects %j at %s', (input, path) => {
    const result = sharePeopleRequestSchema.safeParse(input);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});

describe('setCompanyAccessRequestSchema', () => {
  it('defaults to the latest version', () => {
    expect(setCompanyAccessRequestSchema.parse({ enabled: true })).toEqual({
      enabled: true,
      versionNo: null,
    });
  });
});

describe('updatePersonAccessRequestSchema', () => {
  it('accepts a permission, a version or both, and unpinning', () => {
    expect(updatePersonAccessRequestSchema.parse({ versionNo: null })).toEqual({ versionNo: null });
    expect(updatePersonAccessRequestSchema.safeParse({}).success).toBe(false);
    expect(updatePersonAccessRequestSchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});

describe('userSearchQuerySchema', () => {
  it('needs at least three characters', () => {
    expect(userSearchQuerySchema.safeParse({ q: ' sa ' }).success).toBe(false);
    expect(userSearchQuerySchema.parse({ q: ' sar ' })).toEqual({ q: 'sar' });
  });
});
