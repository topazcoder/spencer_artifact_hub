import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format.ts';

const NOW = new Date('2026-10-03T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('formatRelativeTime', () => {
  it.each([
    [ago(30_000), 'just now'],
    [ago(60_000), '1 minute ago'],
    [ago(45 * 60_000), '45 minutes ago'],
    [ago(3 * 3_600_000), '3 hours ago'],
    [ago(26 * 3_600_000), 'yesterday'],
    [ago(3 * 86_400_000), '3 days ago'],
    [new Date('2026-09-01T12:00:00Z'), 'Sep 1, 2026'],
  ])('formats %s as %j', (date, expected) => {
    expect(formatRelativeTime(date, NOW)).toBe(expected);
  });

  it('accepts ISO strings', () => {
    expect(formatRelativeTime('2026-10-03T11:00:00Z', NOW)).toBe('1 hour ago');
  });
});
