import { ErrorCode, type User } from '@artifact-hub/shared';
import { vi } from 'vitest';

interface Account {
  user: User;
  password: string;
}

function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: ErrorCode, message: string): Response {
  return json(status, { error: { code, message, requestId: 'test-req' } });
}

/**
 * Stubs `fetch` with an in-memory version of the auth endpoints, so component tests run the
 * real API client, hooks and routes.
 */
export function installFakeAuthApi() {
  const accounts = new Map<string, Account>();
  let signedIn: User | null = null;

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const route = `${init.method ?? 'GET'} ${input}`;

    switch (route) {
      case 'GET /api/auth/me':
        return signedIn
          ? json(200, { user: signedIn })
          : error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      case 'POST /api/auth/login': {
        const account = accounts.get(body.email);
        if (!account || account.password !== body.password) {
          return error(401, ErrorCode.UNAUTHENTICATED, 'Invalid email or password.');
        }
        signedIn = account.user;
        return json(200, { user: signedIn });
      }
      case 'POST /api/auth/signup': {
        if (accounts.has(body.email)) {
          return error(409, ErrorCode.CONFLICT, 'An account with this email already exists.');
        }
        const user: User = {
          id: crypto.randomUUID(),
          email: body.email,
          displayName: body.displayName,
          createdAt: new Date().toISOString(),
        };
        accounts.set(body.email, { user, password: body.password });
        signedIn = user;
        return json(201, { user });
      }
      case 'POST /api/auth/logout':
        signedIn = null;
        return json(204);
      default:
        return error(404, ErrorCode.NOT_FOUND, `No fake for ${route}`);
    }
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    addAccount(email: string, password: string, displayName = 'Ada Lovelace') {
      const user: User = {
        id: crypto.randomUUID(),
        email,
        displayName,
        createdAt: new Date().toISOString(),
      };
      accounts.set(email, { user, password });
      return user;
    },
    signIn(user: User) {
      signedIn = user;
    },
    /** Simulates the session expiring on the server. */
    expireSession() {
      signedIn = null;
    },
    calls(route: string) {
      return fetchMock.mock.calls.filter(
        ([url, init]) => `${init?.method ?? 'GET'} ${url}` === route,
      ).length;
    },
  };
}
