import type { Readable } from 'node:stream';
import type {
  ArtifactListSort,
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

/** A person whose artifacts are listed, as the AI search reads names. */
export interface OwnerSummary {
  displayName: string;
  email: string;
}

/** Which artifacts a list covers. Filters only ever narrow what `AccessPolicy` allows. */
export interface ArtifactFilters {
  /** Only artifacts owned by this user. */
  ownerId?: string;
  /** Only artifacts owned by any of these users, picked by the caller; on top of the scope's own filters. */
  ownedBy?: readonly string[];
  /** Only artifacts with this visibility. */
  visibility?: ArtifactVisibility;
  /** Only other users' artifacts shared with this user by name. */
  sharedWith?: string;
  /** Words (or starts of words) to find in the title, tags, description and content. */
  search?: string;
  /** Only artifacts whose current version has one of these types. */
  mimeTypes?: readonly ArtifactMimeType[];
  /** Only artifacts with all of these (normalized) tags. */
  tags?: readonly string[];
  /**
   * Only artifacts whose owner matches any of these: the display name contains it (any case),
   * or the owner has it as their email.
   */
  owners?: readonly string[];
  /** Only artifacts last updated on or after this day (UTC, `YYYY-MM-DD`). */
  updatedFrom?: string;
  /** Only artifacts last updated on or before this day (UTC, `YYYY-MM-DD`). */
  updatedTo?: string;
}

/** How one list order sorts: by a date column of the artifact, in a direction. */
export interface ArtifactSortOrder {
  column: `artifact.${keyof Pick<Artifact, 'createdAt' | 'updatedAt'>}`;
  direction: 'ASC' | 'DESC';
}

export interface ArtifactListOptions extends ArtifactFilters {
  /** Without one, the most relevant first when searching, else `updated_desc`. */
  sort?: ArtifactListSort;
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

/** Which tags `listTags` returns. */
export interface TagListOptions {
  /** Only tags containing this (any case). */
  search?: string;
  /** At most this many; the AI search's tag list by default. */
  limit?: number;
}

export interface ArtifactPage {
  items: ArtifactView[];
  /** Matching artifacts across all pages. */
  total: number;
}
