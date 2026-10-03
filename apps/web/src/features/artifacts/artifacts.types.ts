import type { z } from 'zod';
import type { publishFormSchema } from './publish-form-schema.ts';

export interface ArtifactListParams {
  scope: 'mine';
  /** 1-based. */
  page: number;
  pageSize: number;
}

/** What the publish form holds before the schema normalizes it (tags as one string). */
export type PublishFormValues = z.input<typeof publishFormSchema>;
/** What it submits. */
export type PublishFormOutput = z.output<typeof publishFormSchema>;
