// @vitest-environment jsdom
import type { Artifact } from '@artifact-hub/shared';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

describe('gallery (My artifacts)', () => {
  let api: ReturnType<typeof installFakeApi>;
  let me: Artifact['owner'];

  beforeEach(() => {
    api = installFakeApi();
    const user = api.addAccount('ada@example.com', 'correct horse');
    api.signIn(user);
    me = { id: user.id, displayName: user.displayName };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** An artifact updated `minutesAgo` minutes ago. */
  function artifact(title: string, minutesAgo: number, owner = me): Artifact {
    const updatedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    return {
      id: crypto.randomUUID(),
      title,
      description: '',
      tags: ['alpha', 'beta', 'gamma', 'delta'],
      visibility: 'private',
      status: 'published',
      metadataSource: 'user',
      owner,
      currentVersion: {
        id: crypto.randomUUID(),
        versionNo: 1,
        mimeType: 'text/html',
        sizeBytes: 10,
        sha256: '0'.repeat(64),
        originalFilename: null,
        changeNote: null,
        createdAt: updatedAt,
      },
      latestVersionNo: 1,
      createdAt: updatedAt,
      updatedAt,
    };
  }

  it('invites me to publish when I have nothing yet', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Nothing published yet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish your first artifact' })).toBeTruthy();
  });

  it('shows only my artifacts, most recently updated first, linking to each', async () => {
    const older = artifact('Older', 30);
    api.addArtifact(older);
    api.addArtifact(artifact('Newer', 5));
    api.addArtifact(artifact('Not mine', 1, { id: crypto.randomUUID(), displayName: 'Bob' }));
    renderApp('/');

    expect(await screen.findByText('2 artifacts')).toBeTruthy();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['Newer', 'Older']);
    expect(screen.getByRole('link', { name: /Older/ }).getAttribute('href')).toBe(
      `/artifacts/${older.id}`,
    );
    // Three tags, then a count of the rest.
    expect(screen.getAllByText('+1')).toHaveLength(2);
  });

  it('pages through more than 24 artifacts with page numbers in the URL', async () => {
    for (let i = 1; i <= 25; i++) api.addArtifact(artifact(`Artifact ${i}`, i));
    const app = renderApp('/');

    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(24);

    await userEvent.setup().click(screen.getByRole('link', { name: 'Next page' }));
    expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
    expect(app.location()).toBe('/?page=2');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Artifact 25',
    ]);
    expect(screen.getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
  });

  it('treats an invalid page number as the first page', async () => {
    api.addArtifact(artifact('Only', 1));
    renderApp('/?page=abc');
    expect(await screen.findByRole('heading', { name: 'Only', level: 2 })).toBeTruthy();
    expect(api.calls('GET /api/artifacts?scope=mine&page=1&pageSize=24')).toBe(1);
  });
});
