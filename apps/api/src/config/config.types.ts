import type { z } from 'zod';
import type { envSchema } from './env.js';

/** The validated environment. */
export type Env = z.output<typeof envSchema>;
