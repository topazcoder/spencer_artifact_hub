import { z } from 'zod';

export const APP_NAME = 'Artifact Hub';

/** Public client configuration (`GET /api/config`). */
export const appConfigSchema = z.object({
  /** Largest artifact version the server accepts, in bytes. */
  maxArtifactBytes: z.number().int().positive(),
  features: z.object({
    /**
     * Whether AI is configured. When false, the web app hides AI features instead of showing
     * broken ones. When true, AI can still fail; each feature falls back on its own.
     */
    ai: z.boolean(),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
