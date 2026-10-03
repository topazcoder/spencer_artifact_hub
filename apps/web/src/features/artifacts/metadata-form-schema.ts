import { artifactTagsSchema, createArtifactRequestSchema } from '@artifact-hub/shared';
import { z } from 'zod';

/**
 * The artifact details form (publish and edit), validated with the same rules as the API. Tags
 * are typed as one comma-separated string; any tag problem is reported on that field.
 */
export const metadataFormSchema = z.object({
  title: createArtifactRequestSchema.shape.title,
  description: createArtifactRequestSchema.shape.description,
  tags: z.string().transform((value, ctx) => {
    const tags = value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const result = artifactTagsSchema.safeParse(tags);
    if (result.success) return result.data;
    ctx.addIssue({ code: 'custom', message: result.error.issues[0]?.message ?? 'Invalid tags.' });
    return z.NEVER;
  }),
});
