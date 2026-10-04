import { z } from 'zod';

/** `create`: the first version of a draft. `new_version`: the next version of an artifact. */
export const UPLOAD_SESSION_PURPOSES = ['create', 'new_version'] as const;
export type UploadSessionPurpose = (typeof UPLOAD_SESSION_PURPOSES)[number];

/**
 * `open`: waiting for the file. `done`: uploaded (a repeat upload returns the same result).
 * `expired`: too late; the assistant can ask for a new one.
 */
export const UPLOAD_SESSION_STATUSES = ['open', 'done', 'expired'] as const;
export type UploadSessionStatus = (typeof UPLOAD_SESSION_STATUSES)[number];

/**
 * An upload an MCP client asked for (images, PDFs: binary files it can't send inline), as its
 * owner sees it on the upload page.
 */
export const uploadSessionSchema = z.object({
  purpose: z.enum(UPLOAD_SESSION_PURPOSES),
  status: z.enum(UPLOAD_SESSION_STATUSES),
  artifact: z.object({ id: z.uuid(), title: z.string() }),
  /** The version the file becomes, while `open`. */
  versionNo: z.number().int().positive(),
  changeNote: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});

export type UploadSession = z.infer<typeof uploadSessionSchema>;

/** Response of `GET /api/upload-sessions/:token`. Uploading answers with `ArtifactResponse`. */
export const uploadSessionResponseSchema = z.object({ session: uploadSessionSchema });

export type UploadSessionResponse = z.infer<typeof uploadSessionResponseSchema>;
