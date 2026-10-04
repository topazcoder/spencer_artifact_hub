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

/** What tells two versions' contents apart: the same bytes read as the same type. */
export interface ContentIdentity {
  sha256: string;
  mimeType: ArtifactMimeType;
}

/** A version's content, ready to stream once the caller knows it needs the body. */
export interface ArtifactContent {
  artifact: Artifact;
  version: ArtifactVersion;
  /** Opens the blob. Not called for a 304, so revalidation never touches storage. */
  open(): Promise<Readable>;
}

/** Which artifacts a list covers. Filters only ever narrow what `AccessPolicy` allows. */
export interface ArtifactFilters {
  /** Only artifacts owned by this user. */
  ownerId?: string;
  /** Only artifacts with this visibility. */
  visibility?: ArtifactVisibility;
  /** Only other users' artifacts shared with this user by name. */
  sharedWith?: string;
  /** Words (or starts of words) to find in the title, tags, description and content. */
  search?: string;
  /** Only artifacts whose current version has one of these types. */
  mimeTypes?: readonly ArtifactMimeType[];
  /** Only artifacts with this (normalized) tag. */
  tag?: string;
}

export interface ArtifactListOptions extends ArtifactFilters {
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
  /** What access decisions about it are made on, for other modules to ask `AccessPolicy`. */
  target: AccessTarget;
}

/** An artifact with the facts `AccessPolicy` decides on. */
export interface ResolvedArtifact {
  artifact: Artifact;
  target: AccessTarget;
}

/** A tag and how many of the listed artifacts have it. */
export interface TagCount {
  tag: string;
  count: number;
}

export interface ArtifactPage {
  items: ArtifactView[];
  /** Matching artifacts across all pages. */
  total: number;
}
