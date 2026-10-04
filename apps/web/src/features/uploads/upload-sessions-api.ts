import {
  type Artifact,
  artifactResponseSchema,
  type UploadSession,
  uploadSessionResponseSchema,
} from '@artifact-hub/shared';
import { apiRequest } from '@/lib/api/client.ts';

export const uploadSessionQueryKey = (token: string) => ['upload-session', token] as const;

const sessionPath = (token: string) => `/upload-sessions/${encodeURIComponent(token)}`;

export async function fetchUploadSession(
  token: string,
  signal?: AbortSignal,
): Promise<UploadSession> {
  return (await apiRequest(sessionPath(token), { schema: uploadSessionResponseSchema, signal }))
    .session;
}

/** Sends the file; the artifact comes back with it as its newest version. */
export async function uploadToSession(token: string, file: File): Promise<Artifact> {
  const form = new FormData();
  form.append('file', file);
  return (
    await apiRequest(sessionPath(token), {
      method: 'POST',
      body: form,
      schema: artifactResponseSchema,
    })
  ).artifact;
}
