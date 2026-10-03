// @vitest-environment jsdom
import type { Artifact, ArtifactVersion } from '@artifact-hub/shared';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

describe('share link page', () => {
  let api: ReturnType<typeof installFakeApi>;
  let item: Artifact;

  beforeEach(() => {
    api = installFakeApi();
    const now = new Date().toISOString();
    const version: ArtifactVersion = {
      id: crypto.randomUUID(),
      versionNo: 3,
      mimeType: 'text/html',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
      originalFilename: 'report.html',
      changeNote: null,
      createdAt: now,
    };
    item = {
      id: crypto.randomUUID(),
      title: 'Client report',
      description: 'For Acme',
      tags: [],
      visibility: 'private',
      status: 'published',
      metadataSource: 'user',
      owner: { id: crypto.randomUUID(), displayName: 'Grace Hopper' },
      currentVersion: version,
      latestVersionNo: 3,
      permissions: { comment: false, edit: false, share: false, delete: false },
      createdAt: now,
      updatedAt: now,
    };
    api.addArtifact(item, '<p>report</p>');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the shared version to someone who is not signed in', async () => {
    const token = api.addLink(item.id);
    const app = renderApp(`/s/${token}`);

    expect(await screen.findByRole('heading', { name: 'Client report' })).toBeTruthy();
    expect(app.location()).toBe(`/s/${token}`);
    expect(screen.getByText('Shared by Grace Hopper')).toBeTruthy();
    expect(screen.getByText('v3')).toBeTruthy();
    expect(screen.getByText('For Acme')).toBeTruthy();
    expect(screen.getByTitle('Client report').getAttribute('src')).toBe(`/api/s/${token}/content`);
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(
      `/api/s/${token}/content?download=1`,
    );
    expect(screen.queryByRole('link', { name: /Open in/ })).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow',
    );
  });

  it('offers signed-in users who have access to open it in the app', async () => {
    const token = api.addLink(item.id);
    api.signIn(api.addAccount('ada@example.com', 'pw', 'Ada'));
    renderApp(`/s/${token}`);
    const open = await screen.findByRole('link', { name: 'Open in Artifact Hub' });
    expect(open.getAttribute('href')).toBe(`/artifacts/${item.id}`);
  });

  it.each([
    ['expired', { expired: true }, 'This link has expired'],
    ['turned off', { revoked: true }, 'This link was turned off'],
  ])('explains a link that was %s', async (_, state, heading) => {
    const token = api.addLink(item.id, state);
    renderApp(`/s/${token}`);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByText('Ask the person who shared it with you for a new link.')).toBeTruthy();
  });

  it('explains a link that does not exist, without retrying', async () => {
    renderApp('/s/nope');
    expect(await screen.findByRole('heading', { name: "This link doesn't work" })).toBeTruthy();
    expect(api.calls('GET /api/s/nope')).toBe(1);
  });
});
