import type { Readable } from 'node:stream';
import type { ArtifactMimeType, ArtifactVisibility } from '@artifact-hub/shared';
import type { ContentHint } from '../uploads/content/content.types.js';
import type { ArtifactVersion } from './artifact-version.entity.js';
import type { Artifact } from './artifact.entity.js';

/** Content for a new version, from a multipart upload, an upload session or MCP inline text. */
export interface NewContent extends ContentHint {
  stream: Readable;
}

/** A new version's blob, stored and ready for its row. */
export interface StoredContent {
  storageKey: string;
  mimeType: ArtifactMimeType;
  size: number;
  sha256: string;
  originalFilename: string | null;
}

/** A version's content, ready to stream once the caller knows it needs the body. */
export interface ArtifactContent {
  artifact: Artifact;
  version: ArtifactVersion;
  /** Opens the blob. Not called for a 304, so revalidation never touches storage. */
  open(): Promise<Readable>;
}

export interface ArtifactListOptions {
  /** Only artifacts owned by this user. */
  ownerId?: string;
  /** Only artifacts with this visibility. */
  visibility?: ArtifactVisibility;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface ArtifactPage {
  items: Artifact[];
  /** Matching artifacts across all pages. */
  total: number;
}
