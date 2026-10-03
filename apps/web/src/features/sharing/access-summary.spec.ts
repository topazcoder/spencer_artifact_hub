import type { ArtifactAccess, SharedPerson, ShareLink } from '@artifact-hub/shared';
import { describe, expect, it } from 'vitest';
import { accessSummary, isLinkActive } from './access-summary.ts';

const NOW = new Date();
const person = { permission: 'view' } as SharedPerson;
const link = (expiresAt: string | null): ShareLink => ({
  url: 'http://localhost:5173/s/x',
  pinnedVersionNo: null,
  expiresAt,
  createdAt: NOW.toISOString(),
});
const access = (
  enabled: boolean,
  people: SharedPerson[] = [],
  shareLink: ShareLink | null = null,
): ArtifactAccess => ({ company: { enabled, pinnedVersionNo: null }, people, link: shareLink });

const tomorrow = new Date(NOW.getTime() + 86_400_000).toISOString();
const yesterday = new Date(NOW.getTime() - 86_400_000).toISOString();

describe('accessSummary', () => {
  it.each([
    [access(false), 'Only you can see it.'],
    [access(false, [person]), 'You and 1 person can see it.'],
    [access(false, [person, person]), 'You and 2 people can see it.'],
    [access(true, [person]), 'Everyone at the company can see it.'],
    [access(true, [], link(null)), 'Anyone with the link can see it, without signing in.'],
    [access(false, [], link(tomorrow)), 'Anyone with the link can see it, without signing in.'],
    [access(false, [], link(yesterday)), 'Only you can see it.'],
  ])('describes %j', (input, expected) => {
    expect(accessSummary(input)).toBe(expected);
  });
});

describe('isLinkActive', () => {
  it('is false when off or expired', () => {
    expect(isLinkActive(null)).toBe(false);
    expect(isLinkActive(link(yesterday))).toBe(false);
    expect(isLinkActive(link(tomorrow))).toBe(true);
    expect(isLinkActive(link(null))).toBe(true);
  });
});
