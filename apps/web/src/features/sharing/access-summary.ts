import type { ArtifactAccess } from '@artifact-hub/shared';

/** Who can see the artifact besides its owner, in one sentence. */
export function accessSummary({ company, people }: ArtifactAccess): string {
  if (company.enabled) return 'Everyone at the company can see it.';
  if (people.length === 1) return 'You and 1 person can see it.';
  if (people.length > 1) return `You and ${people.length} people can see it.`;
  return 'Only you can see it.';
}
