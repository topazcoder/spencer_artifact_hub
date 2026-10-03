import type { Readable } from 'node:stream';
import type { ContentHint } from '../uploads/content/content.types.js';
import type { Artifact } from './artifact.entity.js';

/** Content for a new version, from a multipart upload, an upload session or MCP inline text. */
export interface NewContent extends ContentHint {
  stream: Readable;
}

export interface ArtifactListOptions {
  /** Only artifacts owned by this user. */
  ownerId?: string;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface ArtifactPage {
  items: Artifact[];
  /** Matching artifacts across all pages. */
  total: number;
}
