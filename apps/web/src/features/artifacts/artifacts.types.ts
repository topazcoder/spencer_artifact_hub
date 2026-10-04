import type { ArtifactListScope, ArtifactListSort, ArtifactTypeFilter } from '@artifact-hub/shared';
import type { z } from 'zod';
import type { metadataFormSchema } from './metadata-form-schema.ts';

/** What the gallery shows: a scope, narrowed by optional filters. */
export interface GalleryFilters {
  scope: ArtifactListScope;
  /** Words to search for. */
  q?: string;
  type?: ArtifactTypeFilter;
  /** Artifacts with all of these tags. */
  tag?: string[];
  /** Part of the owner's name, or their email (from AI search). */
  owner?: string;
  /** The owner's user id, as picked in the gallery. */
  ownerId?: string;
  /** Last updated on or after this day (`YYYY-MM-DD`, UTC). */
  updatedFrom?: string;
  /** Last updated on or before this day (`YYYY-MM-DD`, UTC). */
  updatedTo?: string;
  /** By last update; without one, the most relevant first when searching, else newest. */
  sort?: ArtifactListSort;
}

export interface ArtifactListParams extends GalleryFilters {
  /** 1-based. */
  page: number;
  pageSize: number;
}

/** What the details form holds before the schema normalizes it (tags as one string). */
export type MetadataFormValues = z.input<typeof metadataFormSchema>;
/** What it submits. */
export type MetadataFormOutput = z.output<typeof metadataFormSchema>;
