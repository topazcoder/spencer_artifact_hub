import {
  type ArtifactAccess,
  artifactAccessResponseSchema,
  type SetCompanyAccessRequest,
  type SetShareLinkRequest,
  type SharedArtifactResponse,
  sharedArtifactResponseSchema,
  type SharePeopleRequest,
  type UpdatePersonAccessRequest,
  type UserSummary,
  userResponseSchema,
  userSearchResponseSchema,
} from '@artifact-hub/shared';
import { artifactQueryKey } from '@/features/artifacts/artifacts-api.ts';
import { apiRequest } from '@/lib/api/client.ts';
import type { ApiRequestOptions } from '@/lib/api/api.types.ts';

/** Under the artifact's key, so it goes with the artifact's other queries. */
export const accessQueryKey = (artifactId: string) =>
  [...artifactQueryKey(artifactId), 'access'] as const;
export const userQueryKey = (id: string) => ['user', id] as const;
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

/** Turns the link on, or changes its expiry or version (the URL stays the same). */
export function setShareLink(
  artifactId: string,
  body: SetShareLinkRequest,
): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/link`, { method: 'PUT', body });
}

export function turnOffShareLink(artifactId: string): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/link`, { method: 'DELETE' });
}

/** A new URL for the link; the old one stops working. */
export function resetShareLink(artifactId: string): Promise<ArtifactAccess> {
  return accessRequest(`${accessPath(artifactId)}/link/reset`, { method: 'POST' });
}

const sharedPath = (token: string) => `/s/${encodeURIComponent(token)}`;

export const sharedArtifactQueryKey = (token: string) => ['shared', token] as const;

/** What a share link shows. Needs no sign-in. */
export function fetchSharedArtifact(
  token: string,
  signal?: AbortSignal,
): Promise<SharedArtifactResponse> {
  return apiRequest(sharedPath(token), { schema: sharedArtifactResponseSchema, signal });
}

/** Where a share link's content is, relative to `/api`. */
export function sharedContentPath(token: string): string {
  return `${sharedPath(token)}/content`;
}

/** Other users whose email or name starts with `query` (3+ characters), at most five. */
export async function searchUsers(query: string, signal?: AbortSignal): Promise<UserSummary[]> {
  const params = new URLSearchParams({ q: query });
  return (await apiRequest(`/users/search?${params}`, { schema: userSearchResponseSchema, signal }))
    .items;
}

/** One user, e.g. to name the owner a gallery filter was set to. */
export async function fetchUser(id: string, signal?: AbortSignal): Promise<UserSummary> {
  return (
    await apiRequest(`/users/${encodeURIComponent(id)}`, { schema: userResponseSchema, signal })
  ).user;
}
