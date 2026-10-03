import { checkRequestOrigin } from './csrf.guard.js';

const APP = 'https://hub.example.com';

describe('checkRequestOrigin', () => {
  const post = { method: 'POST', hasSessionCookie: true };

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe method %s from anywhere', (method) => {
    expect(
      checkRequestOrigin({ method, origin: 'https://evil.test', hasSessionCookie: true }, APP),
    ).toBe('allow');
  });

  it('allows a same-origin request', () => {
    expect(checkRequestOrigin({ ...post, origin: APP }, APP)).toBe('allow');
  });

  it.each([
    'https://evil.test',
    'null',
    'https://hub.example.com.evil.test',
    'http://hub.example.com',
  ])('rejects Origin %s', (origin) => {
    expect(checkRequestOrigin({ ...post, origin }, APP)).toBe('foreign_origin');
  });

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(checkRequestOrigin({ ...post, referer: `${APP}/artifacts/1?x=y` }, APP)).toBe('allow');
    expect(checkRequestOrigin({ ...post, referer: 'https://evil.test/page' }, APP)).toBe(
      'foreign_origin',
    );
    expect(checkRequestOrigin({ ...post, referer: 'not a url' }, APP)).toBe('foreign_origin');
  });

  it('prefers Origin over Referer', () => {
    expect(
      checkRequestOrigin({ ...post, origin: 'https://evil.test', referer: `${APP}/` }, APP),
    ).toBe('foreign_origin');
  });

  it('rejects a cookie-authenticated request with neither header', () => {
    expect(checkRequestOrigin(post, APP)).toBe('missing_origin');
  });

  it('allows a request with neither header when it carries no session cookie', () => {
    expect(checkRequestOrigin({ method: 'POST', hasSessionCookie: false }, APP)).toBe('allow');
  });
});
