import {
  type ArtifactAccess,
  artifactAccessResponseSchema,
  type SetCompanyAccessRequest,
  type SharePeopleRequest,
  type UpdatePersonAccessRequest,
  type UserSummary,
  userSearchResponseSchema,
} from '@artifact-hub/shared';
import { artifactQueryKey } from '@/features/artifacts/artifacts-api.ts';
import { apiRequest } from '@/lib/api/client.ts';
import type { ApiRequestOptions } from '@/lib/api/api.types.ts';

/** Under the artifact's key, so it goes with the artifact's other queries. */
export const accessQueryKey = (artifactId: string) =>
  [...artifactQueryKey(artifactId), 'access'] as const;
export const userSearchQueryKey = (query: string) => ['user-search', query] as const;

const accessPath = (artifactId: string) => `/artifacts/${encodeURIComponent(artifactId)}/access`;

async function accessRequest(
  path: string,
  options: Omit<ApiRequestOptions<unknown>, 'schema'> = {},
): Promise<ArtifactAccess> {
  return (await apiRequest(path, { ...options, schema: artifactAccessResponseSchema })).access;
}

/** Owner only. */
export function fetchAccess(artifactId: string, signal?: AbortSignal): Promise<ArtifactAccess> {
  return accessRequest(accessPath(artifactId), { signal });
}

export function setCompanyAccess(
  artifactId: string,
  body: SetCompanyAccessRequest,
): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/company`, { method: 'PUT', body });
}

/** Fails with `SHARE_RECIPIENT_UNKNOWN` (details: `unknownEmails`) if any email has no account. */
export function sharePeople(artifactId: string, body: SharePeopleRequest): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/people`, { method: 'POST', body });
}

export function updatePerson(
  artifactId: string,
  userId: string,
  body: UpdatePersonAccessRequest,
): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/people/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body,
  });
}

export function removePerson(artifactId: string, userId: string): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/people/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

/** Other users whose email or name starts with `query` (3+ characters), at most five. */
export async function searchUsers(query: string, signal?: AbortSignal): Promise<UserSummary[]> {
  const params = new URLSearchParams({ q: query });
  return (await apiRequest(`/users/search?${params}`, { schema: userSearchResponseSchema, signal }))
    .items;
}
