import { describe, expect, it } from 'vitest';
import { formatBytes } from './format.js';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [500 * 1024, '500 KB'],
    [10 * 1024 * 1024, '10 MB'],
    [1.5 * 1024 * 1024, '1.5 MB'],
    [1024 ** 3, '1 GB'],
  ])('formats %d as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
