import {
  type Artifact,
  type ArtifactListResponse,
  artifactListResponseSchema,
  artifactResponseSchema,
  type CreateArtifactRequest,
} from '@artifact-hub/shared';
import { apiFetchContent, apiRequest } from '@/lib/api/client.ts';
import type { ArtifactListParams } from './artifacts.types.ts';

/** One artifact: `['artifact', id, …]`. Lists: `['artifacts', params]`, invalidated together. */
export const artifactQueryKey = (id: string) => ['artifact', id] as const;
export const artifactListsQueryKey = ['artifacts'] as const;
export const artifactListQueryKey = (params: ArtifactListParams) =>
  [...artifactListsQueryKey, params] as const;

export async function fetchArtifacts(
  { scope, page, pageSize }: ArtifactListParams,
  signal?: AbortSignal,
): Promise<ArtifactListResponse> {
  const query = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) });
  return apiRequest(`/artifacts?${query}`, { schema: artifactListResponseSchema, signal });
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
    await apiRequest(`/artifacts/${encodeURIComponent(id)}`, {
      schema: artifactResponseSchema,
      signal,
    })
  ).artifact;
}

function contentPath(artifactId: string, versionNo: number): string {
  return `/artifacts/${encodeURIComponent(artifactId)}/versions/${versionNo}/content`;
}

/** URL of a version's bytes, for `<img>`, `<iframe>` and download links. */
export function artifactContentUrl(
  artifactId: string,
  versionNo: number,
  { download = false } = {},
): string {
  return `/api${contentPath(artifactId, versionNo)}${download ? '?download=1' : ''}`;
}

export async function fetchArtifactText(
  artifactId: string,
  versionNo: number,
  signal?: AbortSignal,
): Promise<string> {
  return (await apiFetchContent(contentPath(artifactId, versionNo), { signal })).text();
}

export async function fetchArtifactBytes(
  artifactId: string,
  versionNo: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await apiFetchContent(contentPath(artifactId, versionNo), { signal });
  return new Uint8Array(await res.arrayBuffer());
}
