// @vitest-environment jsdom
import type { Artifact, ArtifactMimeType, User } from '@artifact-hub/shared';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

/** `item` with another content type and tags. */
function variant(item: Artifact, mimeType: ArtifactMimeType, tags: string[]): Artifact {
  return { ...item, tags, currentVersion: { ...item.currentVersion!, mimeType } };
}

const shown = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('gallery', () => {
  let api: ReturnType<typeof installFakeApi>;
  let account: User;
  let me: Artifact['owner'];

  beforeEach(() => {
    api = installFakeApi();
    account = api.addAccount('ada@example.com', 'correct horse');
    api.signIn(account);
    me = { id: account.id, displayName: account.displayName };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const bob = { id: crypto.randomUUID(), displayName: 'Bob' };

  /** An artifact updated `minutesAgo` minutes ago. */
  function artifact(
    title: string,
    minutesAgo: number,
    owner = me,
    visibility: Artifact['visibility'] = 'private',
  ): Artifact {
    const updatedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    return {
      id: crypto.randomUUID(),
      title,
      description: '',
      tags: ['alpha', 'beta', 'gamma', 'delta'],
      visibility,
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
      permissions: { comment: true, edit: true, share: true, delete: true },
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

  it('switches to what is shared with the company, mine included, and back', async () => {
    api.addArtifact(artifact('My private', 1));
    api.addArtifact(artifact('My public', 2, me, 'public'));
    api.addArtifact(artifact("Bob's public", 3, bob, 'public'));
    api.addArtifact(artifact("Bob's private", 4, bob));
    const user = userEvent.setup();
    const app = renderApp('/');

    expect(await screen.findByRole('heading', { name: 'My artifacts', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mine' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('link', { name: 'Company' }));
    expect(app.location()).toBe('/?scope=public');
    expect(
      await screen.findByRole('heading', { name: 'Shared with the company', level: 1 }),
    ).toBeTruthy();
    expect(await screen.findByText('2 artifacts')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'My public',
      "Bob's public",
    ]);
    expect(screen.getByRole('link', { name: 'Company' }).getAttribute('aria-current')).toBe('page');

    await user.click(screen.getByRole('link', { name: 'Mine' }));
    expect(app.location()).toBe('/');
  });

  it('keeps the scope when paging', async () => {
    for (let i = 1; i <= 25; i++) api.addArtifact(artifact(`Public ${i}`, i, bob, 'public'));
    renderApp('/?scope=public');
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/?scope=public&page=2',
    );
  });

  it('explains empty shared galleries', async () => {
    api.addArtifact(artifact('My private', 1));
    renderApp('/?scope=public');
    expect(
      await screen.findByRole('heading', { name: 'Nothing shared with the company yet' }),
    ).toBeTruthy();
    cleanup();
    renderApp('/?scope=shared');
    expect(
      await screen.findByRole('heading', { name: 'Nothing shared with you yet' }),
    ).toBeTruthy();
  });

  it('lists what colleagues shared with me by name', async () => {
    const shared = artifact('From Bob', 1, bob);
    api.addArtifact(shared);
    api.addArtifact(artifact("Bob's other", 2, bob));
    api.addArtifact(artifact('Mine', 3));
    api.shareWith(shared.id, account);
    const app = renderApp('/');

    await userEvent.setup().click(await screen.findByRole('link', { name: 'Shared with me' }));
    expect(app.location()).toBe('/?scope=shared');
    expect(await screen.findByText('1 artifact')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'From Bob',
    ]);
  });

  it('treats an unknown scope as mine', async () => {
    renderApp('/?scope=everything');
    expect(await screen.findByRole('heading', { name: 'My artifacts', level: 1 })).toBeTruthy();
    expect(api.calls('GET /api/artifacts?scope=mine&page=1&pageSize=24')).toBe(1);
  });

  describe('search and filters', () => {
    beforeEach(() => {
      api.addArtifact(variant(artifact('Pricing page', 1), 'text/html', ['marketing', 'q3']));
      api.addArtifact(variant(artifact('Sales deck', 2), 'application/pdf', ['q3', 'sales']));
      api.addArtifact(variant(artifact('Team photo', 3), 'image/png', ['team']));
    });

    it('searches as you type, keeping the search in the URL', async () => {
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'pric pag');
      await waitFor(() => expect(app.location()).toBe('/?q=pric+pag'));
      expect(await screen.findByText('1 artifact')).toBeTruthy();
      expect(shown()).toEqual(['Pricing page']);
    });

    it('shows that it is searching until the results arrive', async () => {
      const user = userEvent.setup();
      renderApp('/');
      await screen.findByText('3 artifacts');

      const release = api.holdLists();
      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'deck');
      expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Searching…');
      // Earlier results stay, marked busy.
      expect(screen.getByRole('list', { busy: true })).toBeTruthy();

      release();
      expect(await screen.findByText('1 artifact')).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
      expect(shown()).toEqual(['Sales deck']);
    });

    it('filters by type and tag, starting again from the first page', async () => {
      const user = userEvent.setup();
      const app = renderApp('/?page=2');
      const tag = await screen.findByRole('combobox', { name: 'Tag' });
      // The most used tags first.
      await waitFor(() =>
        expect([...tag.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
          'All tags',
          'q3',
          'marketing',
          'sales',
          'team',
        ]),
      );

      await user.selectOptions(tag, 'q3');
      expect(app.location()).toBe('/?tag=q3');
      expect(await screen.findByText('2 artifacts')).toBeTruthy();

      await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'PDF');
      expect(app.location()).toBe('/?type=pdf&tag=q3');
      await waitFor(() => expect(shown()).toEqual(['Sales deck']));
    });

    it('explains when nothing matches, and clears the filters', async () => {
      const user = userEvent.setup();
      const app = renderApp('/?q=nothing&type=pdf');
      expect(await screen.findByRole('heading', { name: 'No artifacts match' })).toBeTruthy();
      expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe(
        'nothing',
      );

      await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!);
      await waitFor(() => expect(app.location()).toBe('/'));
      expect(await screen.findByText('3 artifacts')).toBeTruthy();
      expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe(
        '',
      );
    });

    it('keeps filters when paging, and drops them when switching tabs', async () => {
      for (let i = 1; i <= 25; i++) api.addArtifact(artifact(`Extra ${i}`, 10 + i));
      renderApp('/?tag=alpha');
      expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
        '/?tag=alpha&page=2',
      );
      expect(screen.getByRole('link', { name: 'Company' }).getAttribute('href')).toBe(
        '/?scope=public',
      );
    });
  });
});
