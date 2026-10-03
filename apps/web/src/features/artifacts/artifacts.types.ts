import type { z } from 'zod';
import type { metadataFormSchema } from './metadata-form-schema.ts';

export interface ArtifactListParams {
  scope: 'mine';
  /** 1-based. */
  page: number;
  pageSize: number;
}

/** What the details form holds before the schema normalizes it (tags as one string). */
export type MetadataFormValues = z.input<typeof metadataFormSchema>;
/** What it submits. */
export type MetadataFormOutput = z.output<typeof metadataFormSchema>;
