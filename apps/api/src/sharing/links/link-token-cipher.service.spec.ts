import type { Env } from '../../config/config.types.js';
import { LinkTokenCipherService } from './link-token-cipher.service.js';

const cipherWith = (fill: number) =>
  new LinkTokenCipherService({ SHARE_LINK_KEY: Buffer.alloc(32, fill).toString('base64') } as Env);

describe('LinkTokenCipherService', () => {
  const cipher = cipherWith(1);

  it('opens what it sealed', () => {
    const sealed = cipher.seal('a-token');
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('a-token');
    expect(cipher.open(sealed)).toBe('a-token');
  });

  it('seals the same token differently each time', () => {
    expect(cipher.seal('a-token')).not.toBe(cipher.seal('a-token'));
  });

  it('refuses altered tokens and other keys', () => {
    const sealed = cipher.seal('a-token');
    const [version, iv, tag, ciphertext] = sealed.split('.');
    const flipped = Buffer.from(ciphertext!, 'base64url');
    flipped[0]! ^= 1;
    expect(() =>
      cipher.open([version, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow();
    expect(() => cipherWith(2).open(sealed)).toThrow();
    expect(() => cipher.open('v2.a.b.c')).toThrow('Unrecognized sealed token');
  });
});
