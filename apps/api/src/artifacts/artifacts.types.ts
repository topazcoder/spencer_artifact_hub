import type { Readable } from 'node:stream';
import type {
  ArtifactMimeType,
  ArtifactPermissions,
  ArtifactVisibility,
} from '@artifact-hub/shared';
import type { AccessTarget } from '../access/access.types.js';
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
  /** Only other users' artifacts shared with this user by name. */
  sharedWith?: string;
  /** 1-based. */
  page: number;
  pageSize: number;
}

/** An artifact as one user sees it. */
export interface ArtifactView {
  artifact: Artifact;
  /** The newest version the user may see: the artifact's current one unless a share pins it. */
  currentVersion: ArtifactVersion | null;
  /** `artifact.latestVersionNo`, or `currentVersion`'s number for pinned viewers. */
  latestVersionNo: number;
  permissions: ArtifactPermissions;
}

/** An artifact with the facts `AccessPolicy` decides on. */
export interface ResolvedArtifact {
  artifact: Artifact;
  target: AccessTarget;
}

export interface ArtifactPage {
  items: ArtifactView[];
  /** Matching artifacts across all pages. */
  total: number;
}
