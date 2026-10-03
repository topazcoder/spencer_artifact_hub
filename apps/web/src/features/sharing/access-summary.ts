import type { ArtifactAccess, ShareLink } from '@artifact-hub/shared';

/** Whether the link opens the artifact right now (it may be on but expired). */
export function isLinkActive(link: ShareLink | null, now: Date = new Date()): link is ShareLink {
  return link !== null && (link.expiresAt === null || new Date(link.expiresAt) > now);
}

/** Who can see the artifact besides its owner, in one sentence: the widest audience first. */
export function accessSummary({ company, people, link }: ArtifactAccess): string {
  if (isLinkActive(link)) return 'Anyone with the link can see it, without signing in.';
  if (company.enabled) return 'Everyone at the company can see it.';
  if (people.length === 1) return 'You and 1 person can see it.';
  if (people.length > 1) return `You and ${people.length} people can see it.`;
  return 'Only you can see it.';
}
