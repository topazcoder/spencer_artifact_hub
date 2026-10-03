import { z } from 'zod';

/** Text formats: accepted as UTF-8, and the only formats MCP clients may send inline. */
export const TEXT_FORMAT_MIME_TYPES = {
  html: 'text/html',
  svg: 'image/svg+xml',
  markdown: 'text/markdown',
} as const;

export type TextFormat = keyof typeof TEXT_FORMAT_MIME_TYPES;

/** Binary formats: identified by their magic bytes only. */
export const BINARY_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

/** Every content type an artifact version can have. The server decides it, never the client. */
export const ARTIFACT_MIME_TYPES = [
  ...Object.values(TEXT_FORMAT_MIME_TYPES),
  ...BINARY_MIME_TYPES,
] as const;

export const artifactMimeTypeSchema = z.enum(ARTIFACT_MIME_TYPES);

export type ArtifactMimeType = z.infer<typeof artifactMimeTypeSchema>;
