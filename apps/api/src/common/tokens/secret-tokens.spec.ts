import { generateSecretToken, hashSecretToken, SECRET_TOKEN_PATTERN } from './secret-tokens.js';

describe('secret tokens', () => {
  it('generates distinct 43-character base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateSecretToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(SECRET_TOKEN_PATTERN);
  });

  it('hashes to SHA-256 hex', () => {
    expect(hashSecretToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
