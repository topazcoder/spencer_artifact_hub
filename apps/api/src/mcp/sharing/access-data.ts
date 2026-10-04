import type { ArtifactAccess } from '@artifact-hub/shared';

/**
 * Who can see an artifact besides its owner, for its owner. The link's URL only when asked:
 * share_artifact and manage_access hand it out, get_artifact doesn't.
 */
export function accessData(access: ArtifactAccess, { linkUrl }: { linkUrl: boolean }) {
  return {
    company: access.company.enabled ? { version: access.company.pinnedVersionNo } : null,
    people: access.people.map((person) => ({
      name: person.user.displayName,
      email: person.user.email,
      permission: person.permission,
      version: person.pinnedVersionNo,
    })),
    link: access.link && {
      ...(linkUrl ? { url: access.link.url } : {}),
      version: access.link.pinnedVersionNo,
      expires_at: access.link.expiresAt,
      expired: access.link.expiresAt !== null && Date.parse(access.link.expiresAt) <= Date.now(),
    },
  };
}
