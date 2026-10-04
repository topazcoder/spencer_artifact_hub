import { requestFingerprint } from './request-fingerprint.js';

describe('requestFingerprint', () => {
  it('is a SHA-256 hex digest', () => {
    expect(requestFingerprint({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not depend on the order of object keys, at any depth', () => {
    expect(requestFingerprint({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(
      requestFingerprint({ b: { d: 'x', c: [1, 2] }, a: 1 }),
    );
  });

  it('leaves out undefined properties, like JSON', () => {
    expect(requestFingerprint({ a: 1, b: undefined })).toBe(requestFingerprint({ a: 1 }));
  });

  it('tells different values apart', () => {
    expect(requestFingerprint({ a: 1 })).not.toBe(requestFingerprint({ a: 2 }));
    expect(requestFingerprint({ a: [1, 2] })).not.toBe(requestFingerprint({ a: [2, 1] }));
    expect(requestFingerprint({ a: '1' })).not.toBe(requestFingerprint({ a: 1 }));
    expect(requestFingerprint({ a: null })).not.toBe(requestFingerprint({}));
  });

  it('does not confuse a key containing quotes with a different structure', () => {
    expect(requestFingerprint({ 'a":1,"b': 2 })).not.toBe(requestFingerprint({ a: 1, b: 2 }));
  });
});
