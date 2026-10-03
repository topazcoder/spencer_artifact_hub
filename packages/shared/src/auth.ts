import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
/** Caps the work an attacker can force on the password hasher. */
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 80;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long.')
  .pipe(z.email('Enter a valid email address.'));

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter your name.')
    .max(DISPLAY_NAME_MAX_LENGTH, `Use at most ${DISPLAY_NAME_MAX_LENGTH} characters.`),
});

export type SignupRequest = z.infer<typeof signupRequestSchema>;

// No minimum length here, so a policy change never locks out existing accounts.
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  createdAt: z.iso.datetime(),
});

export type User = z.infer<typeof userSchema>;

/** Response of signup, login and `GET /api/auth/me`. */
export const authResponseSchema = z.object({ user: userSchema });

export type AuthResponse = z.infer<typeof authResponseSchema>;
