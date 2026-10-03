import type { ArtifactAccess, SharedPerson } from '@artifact-hub/shared';
import { describe, expect, it } from 'vitest';
import { accessSummary } from './access-summary.ts';

const person = { permission: 'view' } as SharedPerson;
const access = (enabled: boolean, people: SharedPerson[] = []): ArtifactAccess => ({
  company: { enabled, pinnedVersionNo: null },
  people,
});

describe('accessSummary', () => {
  it.each([
    [access(false), 'Only you can see it.'],
    [access(false, [person]), 'You and 1 person can see it.'],
    [access(false, [person, person]), 'You and 2 people can see it.'],
    [access(true, [person]), 'Everyone at the company can see it.'],
  ])('describes %j', (input, expected) => {
    expect(accessSummary(input)).toBe(expected);
  });
});
