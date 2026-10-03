import type { loginRequestSchema, signupRequestSchema } from '@artifact-hub/shared';
import type { z } from 'zod';

/** What the forms hold before the shared schema normalizes it (trims, lowercases the email). */
export type LoginFormValues = z.input<typeof loginRequestSchema>;
export type SignupFormValues = z.input<typeof signupRequestSchema>;
