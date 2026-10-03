import { ErrorCode } from '@artifact-hub/shared';
import { ByteMeter } from './byte-meter.js';

describe('ByteMeter', () => {
  it('passes chunks through until the running total exceeds the limit', () => {
    const meter = new ByteMeter(5);
    expect(meter.add(Buffer.from('abc'))).toEqual(Buffer.from('abc'));
    expect(meter.add(Buffer.from('de'))).toEqual(Buffer.from('de'));
    expect(() => meter.add(Buffer.from('f'))).toThrow(
      expect.objectContaining({ code: ErrorCode.ARTIFACT_TOO_LARGE, details: { maxBytes: 5 } }),
    );
  });

  it('counts strings in bytes, not characters', () => {
    const meter = new ByteMeter(3);
    expect(meter.add('é')).toEqual(Buffer.from('é'));
    expect(() => meter.add('é')).toThrow(expect.objectContaining({ code: 'ARTIFACT_TOO_LARGE' }));
  });

  it.each([
    [10 * 1024 * 1024, '10 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [500 * 1024, '500 KB'],
    [100, '100 B'],
  ])('describes a %d-byte limit as %s', (maxBytes, label) => {
    expect(() => new ByteMeter(maxBytes).add(Buffer.alloc(maxBytes + 1))).toThrow(
      `The file is larger than the ${label} limit.`,
    );
  });
});
