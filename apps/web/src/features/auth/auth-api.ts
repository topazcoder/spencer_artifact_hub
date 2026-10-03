import {
  authResponseSchema,
  type LoginRequest,
  type SignupRequest,
  type User,
} from '@artifact-hub/shared';
import { isApiError } from '@/lib/api/api-error.ts';
import { apiRequest } from '@/lib/api/client.ts';

/** Cache key of the signed-in user: a `User`, or `null` when signed out. */
export const currentUserQueryKey = ['auth', 'me'] as const;

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return (await apiRequest('/auth/me', { schema: authResponseSchema })).user;
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) return null;
    throw error;
  }
}

export async function login(body: LoginRequest): Promise<User> {
  return (await apiRequest('/auth/login', { method: 'POST', body, schema: authResponseSchema }))
    .user;
}

export async function signup(body: SignupRequest): Promise<User> {
  return (await apiRequest('/auth/signup', { method: 'POST', body, schema: authResponseSchema }))
    .user;
}

export function logout(): Promise<void> {
  return apiRequest('/auth/logout', { method: 'POST' });
}
