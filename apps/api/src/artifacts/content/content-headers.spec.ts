import { CONTENT_SECURITY_POLICY, etagMatches, servedContentType } from './content-headers.js';

describe('CONTENT_SECURITY_POLICY', () => {
  const directives = CONTENT_SECURITY_POLICY.split('; ');

  it('sandboxes the content without allow-same-origin', () => {
    expect(directives[0]).toBe('sandbox allow-scripts allow-popups');
    expect(CONTENT_SECURITY_POLICY).not.toContain('allow-same-origin');
  });

  it('blocks network APIs, forms, nested frames and <base>, and only lets the app frame it', () => {
    expect(directives).toEqual(
      expect.arrayContaining([
        "default-src 'none'",
        "connect-src 'none'",
        "form-action 'none'",
        "frame-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'self'",
      ]),
    );
  });
});

describe('servedContentType', () => {
  it('adds the UTF-8 charset to text formats only', () => {
    expect(servedContentType('text/html')).toBe('text/html; charset=utf-8');
    expect(servedContentType('image/svg+xml')).toBe('image/svg+xml; charset=utf-8');
    expect(servedContentType('image/png')).toBe('image/png');
  });
});

describe('etagMatches', () => {
  const etag = '"abc"';

  it.each([
    ['"abc"', true],
    ['W/"abc"', true],
    ['"x", "abc"', true],
    ['*', true],
    ['"abd"', false],
    [undefined, false],
  ])('If-None-Match %j → %s', (header, expected) => {
    expect(etagMatches(header, etag)).toBe(expected);
  });
});
