import type { ShareLink } from '@artifact-hub/shared';
import { describe, expect, it } from 'vitest';
import { expiresAtFor, expiryLabel } from './link-expiry.ts';

const NOW = new Date('2026-10-03T12:00:00Z');
const link = (expiresAt: string | null): ShareLink => ({
  url: 'http://localhost:5173/s/x',
  pinnedVersionNo: null,
  expiresAt,
  createdAt: NOW.toISOString(),
});

describe('link expiry', () => {
  it('turns presets into dates', () => {
    expect(expiresAtFor('7', NOW)).toBe('2026-10-10T12:00:00.000Z');
    expect(expiresAtFor('never', NOW)).toBeNull();
  });

  it.each([
    [null, 'Never expires'],
    ['2026-10-04T12:00:00Z', 'Expires tomorrow'],
    ['2026-10-03T12:00:00Z', 'Expired'],
  ])('describes %s as %j', (expiresAt, label) => {
    expect(expiryLabel(link(expiresAt), NOW)).toBe(label);
  });
});
