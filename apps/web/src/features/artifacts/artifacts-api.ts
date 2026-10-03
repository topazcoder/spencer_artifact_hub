import {
  type Artifact,
  type ArtifactListResponse,
  type ArtifactListScope,
  type ArtifactTagListResponse,
  artifactTagListResponseSchema,
  type ArtifactVersion,
  artifactListResponseSchema,
  artifactResponseSchema,
  artifactVersionListResponseSchema,
  type CreateArtifactRequest,
  type CreateVersionRequest,
  type UpdateArtifactRequest,
} from '@artifact-hub/shared';
import { apiFetchContent, apiRequest } from '@/lib/api/client.ts';
import type { ArtifactListParams } from './artifacts.types.ts';

/**
 * One artifact: `['artifact', id]`, its versions under it (invalidating the artifact refreshes
 * both). Lists: `['artifacts', params]`, invalidated together.
 */
export const artifactQueryKey = (id: string) => ['artifact', id] as const;
export const artifactVersionsQueryKey = (id: string) =>
  [...artifactQueryKey(id), 'versions'] as const;
export const artifactListsQueryKey = ['artifacts'] as const;
export const artifactListQueryKey = (params: ArtifactListParams) =>
  [...artifactListsQueryKey, params] as const;

export async function fetchArtifacts(
  { scope, page, pageSize, q, type, tag }: ArtifactListParams,
  signal?: AbortSignal,
): Promise<ArtifactListResponse> {
  const query = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) });
  for (const [key, value] of Object.entries({ q, type, tag })) {
    if (value) query.set(key, value);
  }
  return apiRequest(`/artifacts?${query}`, { schema: artifactListResponseSchema, signal });
}

export const artifactTagsQueryKey = (scope: ArtifactListScope) =>
  [...artifactListsQueryKey, 'tags', scope] as const;

/** The tags used in a gallery scope, the most used first. */
export async function fetchArtifactTags(
  scope: ArtifactListScope,
  signal?: AbortSignal,
): Promise<ArtifactTagListResponse['items']> {
  const query = new URLSearchParams({ scope });
  return (
    await apiRequest(`/artifacts/tags?${query}`, { schema: artifactTagListResponseSchema, signal })
  ).items;
}

/** Multipart upload: the metadata first, then the file (the server reads them in that order). */
export async function publishArtifact(
  file: File,
  metadata: CreateArtifactRequest,
): Promise<Artifact> {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', file);
  return (
    await apiRequest('/artifacts', { method: 'POST', body: form, schema: artifactResponseSchema })
  ).artifact;
}

export async function fetchArtifact(id: string, signal?: AbortSignal): Promise<Artifact> {
  return (
    await apiRequest(artifactPath(id), {
      schema: artifactResponseSchema,
      signal,
    })
  ).artifact;
}

const artifactPath = (id: string) => `/artifacts/${encodeURIComponent(id)}`;

/** Multipart, like publishing: the details first, then the file. Returns the updated artifact. */
export async function publishVersion(
  id: string,
  file: File,
  metadata: CreateVersionRequest,
): Promise<Artifact> {
  const form = new FormData();
  form.append('metadata', JSON.stringify(metadata));
  form.append('file', file);
  return (
    await apiRequest(`${artifactPath(id)}/versions`, {
      method: 'POST',
      body: form,
      schema: artifactResponseSchema,
    })
  ).artifact;
}

/** Every version, newest first. */
export async function fetchArtifactVersions(
  id: string,
  signal?: AbortSignal,
): Promise<ArtifactVersion[]> {
  return (
    await apiRequest(`${artifactPath(id)}/versions`, {
      schema: artifactVersionListResponseSchema,
      signal,
    })
  ).items;
}

export async function updateArtifact(
  id: string,
  changes: UpdateArtifactRequest,
): Promise<Artifact> {
  return (
    await apiRequest(artifactPath(id), {
      method: 'PATCH',
      body: changes,
      schema: artifactResponseSchema,
    })
  ).artifact;
}

export async function deleteArtifact(id: string): Promise<void> {
  await apiRequest(artifactPath(id), { method: 'DELETE' });
}

/** Where a version's bytes are, relative to `/api`. */
export function artifactContentPath(artifactId: string, versionNo: number): string {
  return `${artifactPath(artifactId)}/versions/${versionNo}/content`;
}

/** URL of a version's bytes, for `<img>`, `<iframe>` and download links. */
export function artifactContentUrl(
  artifactId: string,
  versionNo: number,
  { download = false } = {},
): string {
  return `/api${artifactContentPath(artifactId, versionNo)}${download ? '?download=1' : ''}`;
}

/** Content (at a path relative to `/api`) as text, e.g. Markdown. */
export async function fetchContentText(contentPath: string, signal?: AbortSignal): Promise<string> {
  return (await apiFetchContent(contentPath, { signal })).text();
}

/** Content (at a path relative to `/api`) as bytes, e.g. a PDF. */
export async function fetchContentBytes(
  contentPath: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await apiFetchContent(contentPath, { signal });
  return new Uint8Array(await res.arrayBuffer());
}
