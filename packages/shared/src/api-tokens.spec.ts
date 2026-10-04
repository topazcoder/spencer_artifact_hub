import { describe, expect, it } from 'vitest';
import { API_TOKEN_NAME_MAX_LENGTH, createApiTokenRequestSchema } from './api-tokens.js';

describe('createApiTokenRequestSchema', () => {
  it('trims the name', () => {
    expect(createApiTokenRequestSchema.parse({ name: '  Claude Desktop ' })).toEqual({
      name: 'Claude Desktop',
    });
  });

  it.each([{ name: '   ' }, { name: 'x'.repeat(API_TOKEN_NAME_MAX_LENGTH + 1) }, {}])(
    'rejects %j',
    (input) => {
      expect(createApiTokenRequestSchema.safeParse(input).success).toBe(false);
    },
  );
});
