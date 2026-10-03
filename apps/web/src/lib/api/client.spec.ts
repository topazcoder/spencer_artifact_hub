import { ErrorCode } from '@artifact-hub/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError } from './api-error.ts';
import { apiFetchContent, apiRequest } from './client.ts';

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function catchError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends JSON to /api with the session cookie and validates the response', async () => {
    const fetchMock = stubFetch(json(200, { ok: true }));
    const result = await apiRequest('/things', {
      method: 'POST',
      body: { a: 1 },
      schema: z.object({ ok: z.boolean() }),
    });
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/things',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{"a":1}',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('returns nothing for 204', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns error bodies into ApiError, with field issues', async () => {
    stubFetch(
      json(400, {
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'The request is invalid.',
          details: [{ path: 'email', message: 'Enter a valid email address.' }],
          requestId: 'req-1',
        },
      }),
    );
    const error = await catchError(apiRequest('/auth/login', { method: 'POST', body: {} }));
    expect(error).toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      requestId: 'req-1',
    });
    expect(error.fieldIssues).toEqual([{ path: 'email', message: 'Enter a valid email address.' }]);
    expect(error.isTransient).toBe(false);
  });

  it('reports network failures as NETWORK_ERROR', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const error = await catchError(apiRequest('/auth/me'));
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(error.isTransient).toBe(true);
  });

  it('rejects responses that do not match the expected shape', async () => {
    stubFetch(json(200, { unexpected: true }));
    const error = await catchError(
      apiRequest('/auth/me', { schema: z.object({ user: z.string() }) }),
    );
    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('handles error responses that are not JSON (e.g. a proxy page)', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    const error = await catchError(apiRequest('/auth/me'));
    expect(error).toMatchObject({ status: 502, code: ErrorCode.INTERNAL_ERROR });
    expect(error.isTransient).toBe(true);
  });
});

describe('apiRequest with FormData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the form as is, letting the browser set the multipart Content-Type', async () => {
    const fetchMock = stubFetch(json(201, { ok: true }));
    const form = new FormData();
    form.append('metadata', '{}');
    await apiRequest('/artifacts', { method: 'POST', body: form });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/artifacts',
      expect.objectContaining({ body: form, headers: { Accept: 'application/json' } }),
    );
  });
});

describe('apiFetchContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the raw response from /api with the session cookie', async () => {
    const fetchMock = stubFetch(new Response('# Notes', { status: 200 }));
    const res = await apiFetchContent('/artifacts/a/versions/1/content');
    expect(await res.text()).toBe('# Notes');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/artifacts/a/versions/1/content',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('throws ApiError for error responses', async () => {
    stubFetch(json(404, { error: { code: ErrorCode.NOT_FOUND, message: 'Version not found.' } }));
    const error = await catchError(apiFetchContent('/artifacts/a/versions/9/content'));
    expect(error).toMatchObject({ status: 404, code: ErrorCode.NOT_FOUND });
  });
});
