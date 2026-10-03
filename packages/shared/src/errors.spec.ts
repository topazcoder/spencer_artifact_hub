import { describe, expect, it } from 'vitest';
import { apiErrorBodySchema, ErrorCode } from './errors.js';

describe('apiErrorBodySchema', () => {
  it('accepts a well-formed error body', () => {
    const body = {
      error: { code: ErrorCode.NOT_FOUND, message: 'Not found', requestId: 'abc' },
    };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
  });

  it('rejects unknown error codes', () => {
    const result = apiErrorBodySchema.safeParse({ error: { code: 'NOPE', message: 'x' } });
    expect(result.success).toBe(false);
  });
});
