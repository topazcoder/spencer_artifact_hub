import { type Artifact, type ArtifactMimeType, ErrorCode, type User } from '@artifact-hub/shared';
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

const LIST_ROUTE = /^GET \/api\/artifacts\?(.*)$/;
const ARTIFACT_ROUTE = /^GET \/api\/artifacts\/([^/?]+)$/;
const CONTENT_ROUTE = /^GET \/api\/artifacts\/([^/?]+)\/versions\/(\d+)\/content$/;

const MIME_BY_EXTENSION: Record<string, ArtifactMimeType> = {
  html: 'text/html',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  png: 'image/png',
  pdf: 'application/pdf',
};

/**
 * Stubs `fetch` with an in-memory version of the API (auth, config, publishing and reading
 * artifacts), so component tests run the real API client, hooks and routes.
 */
export function installFakeApi() {
  const accounts = new Map<string, Account>();
  const artifacts = new Map<string, { artifact: Artifact; content: BodyInit }>();
  /** Every publish request's form, in the order its parts were appended. */
  const publishedForms: FormData[] = [];
  let nextPublishResponse: Response | null = null;
  let maxArtifactBytes = 10 * 1024 * 1024;
  let signedIn: User | null = null;

  const publish = (form: FormData): Response => {
    publishedForms.push(form);
    if (nextPublishResponse) {
      const response = nextPublishResponse;
      nextPublishResponse = null;
      return response;
    }
    const metadata = JSON.parse(String(form.get('metadata')));
    const file = form.get('file') as File;
    const now = new Date().toISOString();
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      title: metadata.title,
      description: metadata.description ?? '',
      tags: metadata.tags ?? [],
      visibility: 'private',
      status: 'published',
      metadataSource: 'user',
      owner: { id: signedIn!.id, displayName: signedIn!.displayName },
      currentVersion: {
        id: crypto.randomUUID(),
        versionNo: 1,
        mimeType: MIME_BY_EXTENSION[file.name.split('.').pop() ?? ''] ?? 'text/markdown',
        sizeBytes: file.size,
        sha256: '0'.repeat(64),
        originalFilename: file.name,
        changeNote: null,
        createdAt: now,
      },
      latestVersionNo: 1,
      createdAt: now,
      updatedAt: now,
    };
    artifacts.set(artifact.id, { artifact, content: file });
    return json(201, { artifact });
  };

  const listMine = (query: URLSearchParams): Response => {
    const page = Number(query.get('page') ?? 1);
    const pageSize = Number(query.get('pageSize') ?? 24);
    const mine = [...artifacts.values()]
      .map(({ artifact }) => artifact)
      .filter((artifact) => artifact.owner.id === signedIn?.id)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const items = mine.slice((page - 1) * pageSize, page * pageSize);
    return json(200, { items, page, pageSize, total: mine.length });
  };

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const route = `${init.method ?? 'GET'} ${input}`;

    if (route === 'GET /api/config') return json(200, { maxArtifactBytes });
    const listMatch = LIST_ROUTE.exec(route);
    if (listMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      return listMine(new URLSearchParams(listMatch[1]));
    }
    if (route === 'POST /api/artifacts' && init.body instanceof FormData) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      return publish(init.body);
    }

    const artifactMatch = ARTIFACT_ROUTE.exec(route) ?? CONTENT_ROUTE.exec(route);
    if (artifactMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const stored = artifacts.get(decodeURIComponent(artifactMatch[1] ?? ''));
      if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
      if (artifactMatch[2] === undefined) return json(200, { artifact: stored.artifact });
      return new Response(stored.content, { status: 200 });
    }

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
    publishedForms,
    /** The next publish request fails with this error instead of succeeding. */
    failNextPublish(status: number, code: ErrorCode, message: string, details?: unknown) {
      nextPublishResponse = json(status, {
        error: { code, message, details, requestId: 'test-req' },
      });
    },
    setMaxArtifactBytes(bytes: number) {
      maxArtifactBytes = bytes;
    },
    /** Serves `artifact` and, for any of its versions, `content`. */
    addArtifact(artifact: Artifact, content: BodyInit = '') {
      artifacts.set(artifact.id, { artifact, content });
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
