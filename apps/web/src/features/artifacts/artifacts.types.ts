import type { ArtifactListScope, ArtifactTypeFilter } from '@artifact-hub/shared';
import type { z } from 'zod';
import type { metadataFormSchema } from './metadata-form-schema.ts';

/** What the gallery shows: a scope, narrowed by optional filters. */
export interface GalleryFilters {
  scope: ArtifactListScope;
  /** Words to search for. */
  q?: string;
  type?: ArtifactTypeFilter;
  tag?: string;
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
