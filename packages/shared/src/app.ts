import { z } from 'zod';

export const APP_NAME = 'Artifact Hub';

/** Public client configuration (`GET /api/config`). AI feature flags join it in step 24. */
export const appConfigSchema = z.object({
  /** Largest artifact version the server accepts, in bytes. */
  maxArtifactBytes: z.number().int().positive(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
