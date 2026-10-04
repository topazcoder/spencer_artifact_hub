// @vitest-environment jsdom
import type { Artifact, ArtifactMimeType, User } from '@artifact-hub/shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

/** `item` with another content type and tags. */
function variant(item: Artifact, mimeType: ArtifactMimeType, tags: string[]): Artifact {
  return { ...item, tags, currentVersion: { ...item.currentVersion!, mimeType } };
}

const shown = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

/** Opens AI search, describes `text` and searches. */
async function aiSearch(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(await screen.findByRole('button', { name: 'AI search' }));
  const dialog = await screen.findByRole('dialog', { name: 'Search with AI' });
  await user.type(within(dialog).getByLabelText('What are you looking for?'), text);
  await user.click(within(dialog).getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

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
    const show = () => screen.getByRole('combobox', { name: 'Show' }) as HTMLSelectElement;
    expect(show().value).toBe('mine');

    await user.selectOptions(show(), 'public');
    expect(app.location()).toBe('/?scope=public');
    expect(
      await screen.findByRole('heading', { name: 'Shared with the company', level: 1 }),
    ).toBeTruthy();
    expect(await screen.findByText('2 artifacts')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'My public',
      "Bob's public",
    ]);
    expect(show().value).toBe('public');

    await user.selectOptions(show(), 'mine');
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

    await userEvent
      .setup()
      .selectOptions(await screen.findByRole('combobox', { name: 'Show' }), 'shared');
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

    describe('on a small screen', () => {
      beforeEach(() => {
        // A phone: no media query matches, so the screen isn't "wide".
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          value: (query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }),
        });
      });

      afterEach(() => {
        Reflect.deleteProperty(window, 'matchMedia');
      });

      it('keeps the search in view and the other filters in a dialog opened by an icon', async () => {
        const user = userEvent.setup();
        const app = renderApp('/');
        await screen.findByText('3 artifacts');
        expect(screen.getByRole('searchbox', { name: 'Search' })).toBeTruthy();
        expect(screen.queryByRole('combobox', { name: 'Type' })).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Filters' }));
        const dialog = await screen.findByRole('dialog', { name: 'Filters' });
        await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Type' }), 'PDF');
        // Applied at once, and the dialog stays for the next filter.
        expect(app.location()).toBe('/?type=pdf');
        await user.selectOptions(
          within(dialog).getByRole('combobox', { name: 'Sort by' }),
          'updated_asc',
        );
        expect(app.location()).toBe('/?type=pdf&sort=updated_asc');
        // Even when the scope changes, again and again, without repeating any field.
        const show = within(dialog).getByRole('combobox', { name: 'Show' });
        for (const scope of ['public', 'shared', 'mine', 'public']) {
          await user.selectOptions(show, scope);
          expect(screen.getByRole('dialog', { name: 'Filters' })).toBeTruthy();
          expect(within(dialog).getAllByRole('combobox', { name: 'Filter by tags' })).toHaveLength(
            1,
          );
          expect(within(dialog).queryAllByRole('textbox', { name: 'Owner' })).toHaveLength(
            scope === 'mine' ? 0 : 1,
          );
        }

        await user.click(within(dialog).getByRole('button', { name: 'Done' }));
        expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
      });
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

    it('filters by the owner picked from the matching users, sending their id', async () => {
      const grace = api.addAccount('grace@example.com', 'correct horse', 'Grace Hopper');
      const hopper = { id: grace.id, displayName: grace.displayName };
      api.addArtifact(artifact('Compiler notes', 0, hopper, 'public'));
      api.addArtifact(artifact("Bob's public", 1, bob, 'public'));
      const user = userEvent.setup();
      const app = renderApp('/?scope=public');
      await screen.findByText('2 artifacts');

      const owner = screen.getByRole('textbox', { name: 'Owner' });
      await user.type(owner, 'grac');
      await waitFor(() =>
        expect(document.querySelector('datalist option[value="grace@example.com"]')).toBeTruthy(),
      );
      // Choosing a suggestion fills in its email.
      fireEvent.change(owner, { target: { value: 'grace@example.com' } });

      await waitFor(() => expect(app.location()).toBe(`/?scope=public&ownerId=${grace.id}`));
      expect(api.calls(`GET /api/users/${grace.id}`)).toBe(1);
      await waitFor(() => expect(shown()).toEqual(['Compiler notes']));
      expect(screen.getByRole('button', { name: 'Remove filter: By Grace Hopper' })).toBeTruthy();
      expect(screen.queryByRole('textbox', { name: 'Owner' })).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Remove filter: By Grace Hopper' }));
      expect(app.location()).toBe('/?scope=public');
      expect(screen.getByRole('textbox', { name: 'Owner' })).toBeTruthy();
    });

    it('offers the owner filter only for shared and company artifacts', async () => {
      const grace = api.addAccount('grace@example.com', 'correct horse', 'Grace Hopper');
      api.addArtifact(
        artifact('Compiler notes', 0, { id: grace.id, displayName: grace.displayName }, 'public'),
      );
      const user = userEvent.setup();
      const app = renderApp(`/?scope=public&ownerId=${grace.id}`);
      const show = () => screen.getByRole('combobox', { name: 'Show' });
      await screen.findByRole('button', { name: 'Remove filter: By Grace Hopper' });

      // Switching to my artifacts drops an owner nobody else could be.
      await user.selectOptions(show(), 'mine');
      expect(app.location()).toBe('/');
      expect(screen.queryByRole('textbox', { name: 'Owner' })).toBeNull();

      await user.selectOptions(show(), 'shared');
      expect(screen.getByRole('textbox', { name: 'Owner' })).toBeTruthy();
      await user.selectOptions(show(), 'public');
      expect(screen.getByRole('textbox', { name: 'Owner' })).toBeTruthy();
    });

    it('names the owner of a filter from the URL', async () => {
      const grace = api.addAccount('grace@example.com', 'correct horse', 'Grace Hopper');
      api.addArtifact(
        artifact('Compiler notes', 0, { id: grace.id, displayName: grace.displayName }, 'public'),
      );
      renderApp(`/?scope=public&ownerId=${grace.id}`);
      expect(
        await screen.findByRole('button', { name: 'Remove filter: By Grace Hopper' }),
      ).toBeTruthy();
    });

    it('sorts by publish date or last update, recently updated first by default', async () => {
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');
      expect(shown()).toEqual(['Pricing page', 'Sales deck', 'Team photo']);

      const sortBy = async (value: string) =>
        user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), value);
      await sortBy('updated_asc');
      expect(app.location()).toBe('/?sort=updated_asc');
      await waitFor(() => expect(shown()).toEqual(['Team photo', 'Sales deck', 'Pricing page']));

      await sortBy('newest');
      expect(app.location()).toBe('/?sort=newest');
      await waitFor(() => expect(shown()).toEqual(['Pricing page', 'Sales deck', 'Team photo']));

      await sortBy('oldest');
      expect(app.location()).toBe('/?sort=oldest');
      await waitFor(() => expect(shown()).toEqual(['Team photo', 'Sales deck', 'Pricing page']));

      await sortBy('');
      expect(app.location()).toBe('/');
      await waitFor(() => expect(shown()).toEqual(['Pricing page', 'Sales deck', 'Team photo']));
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

    const tagOptions = () =>
      [...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'));

    it('filters by type and tags, starting again from the first page', async () => {
      const user = userEvent.setup();
      const app = renderApp('/?page=2');
      const tags = await screen.findByRole('combobox', { name: 'Filter by tags' });
      // A few of the scope's tags, the most used first.
      await waitFor(() => expect(tagOptions()).toEqual(['q3', 'marketing', 'sales', 'team']));

      // Choosing a suggestion fills in the tag.
      fireEvent.change(tags, { target: { value: 'q3' } });
      await waitFor(() => expect(app.location()).toBe('/?tag=q3'));
      expect(await screen.findByText('2 artifacts')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Remove tag q3' })).toBeTruthy();
      // A picked tag isn't suggested again, and the box is empty for the next one.
      await waitFor(() => expect(tagOptions()).not.toContain('q3'));
      expect((tags as HTMLInputElement).value).toBe('');

      await user.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'PDF');
      expect(app.location()).toBe('/?type=pdf&tag=q3');
      await waitFor(() => expect(shown()).toEqual(['Sales deck']));
    });

    it('does not ask for the suggestions again after a tag is picked', async () => {
      const user = userEvent.setup();
      renderApp('/');
      const tags = await screen.findByRole('combobox', { name: 'Filter by tags' });
      await waitFor(() => expect(tagOptions()).toContain('q3'));

      await user.type(tags, 'sal');
      await waitFor(() => expect(tagOptions()).toEqual(['sales']));
      expect(api.calls('GET /api/artifacts/tags?scope=mine&q=sal')).toBe(1);

      fireEvent.change(tags, { target: { value: 'sales' } });
      await screen.findByRole('button', { name: 'Remove tag sales' });
      // Past the search delay, when the cleared text would trigger a request.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(api.calls('GET /api/artifacts/tags?scope=mine')).toBe(1);
    });

    it('picks several tags, narrowing to artifacts with all of them', async () => {
      const user = userEvent.setup();
      const app = renderApp('/');
      const tags = await screen.findByRole('combobox', { name: 'Filter by tags' });
      await waitFor(() => expect(tagOptions()).toContain('q3'));

      fireEvent.change(tags, { target: { value: 'q3' } });
      await waitFor(() => expect(app.location()).toBe('/?tag=q3'));
      await waitFor(() => expect(tagOptions()).toContain('sales'));
      fireEvent.change(tags, { target: { value: 'sales' } });
      await waitFor(() => expect(app.location()).toBe('/?tag=q3&tag=sales'));
      await waitFor(() => expect(shown()).toEqual(['Sales deck']));

      await user.click(screen.getByRole('button', { name: 'Remove tag q3' }));
      expect(app.location()).toBe('/?tag=sales');
    });

    it('searches the tags on the server as you type, never listing them all', async () => {
      for (let i = 1; i <= 12; i++)
        api.addArtifact(variant(artifact(`T${i}`, 10 + i), 'text/html', [`topic-${i}`]));
      const user = userEvent.setup();
      renderApp('/');
      const tags = await screen.findByRole('combobox', { name: 'Filter by tags' });
      await waitFor(() => expect(tagOptions()).toHaveLength(10));

      // "topic-1" is a whole tag but the start of others: typing doesn't pick it.
      await user.type(tags, 'topic-12');
      await waitFor(() => expect(tagOptions()).toEqual(['topic-12']));
      expect(api.calls('GET /api/artifacts/tags?scope=mine&q=topic-12')).toBe(1);
      expect(screen.queryByRole('button', { name: /^Remove tag/ })).toBeNull();

      await user.keyboard('{Enter}');
      expect(await screen.findByRole('button', { name: 'Remove tag topic-12' })).toBeTruthy();
      expect((tags as HTMLInputElement).value).toBe('');

      // Backspace in the empty field removes the last picked tag.
      await user.keyboard('{Backspace}');
      expect(screen.queryByRole('button', { name: /^Remove tag/ })).toBeNull();
    });

    it('reads several tags from the URL', async () => {
      renderApp('/?tag=q3&tag=sales');
      expect(await screen.findByRole('button', { name: 'Remove tag q3' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Remove tag sales' })).toBeTruthy();
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

    it('turns a description into filters, with owner and dates removable', async () => {
      const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      api.enableAi((q, scope) => ({
        interpreted: true,
        filters: {
          scope: scope as 'mine',
          q: 'deck',
          type: 'pdf',
          owner: 'ada',
          updatedFrom: since,
        },
      }));
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');

      await aiSearch(user, 'PDF decks Ada made since yesterday');
      expect(app.location()).toBe(`/?q=deck&type=pdf&owner=ada&updatedFrom=${since}`);
      expect(api.interpretRequests).toEqual([
        { q: 'PDF decks Ada made since yesterday', scope: 'mine' },
      ]);
      expect((screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement).value).toBe(
        'deck',
      );
      await waitFor(() => expect(shown()).toEqual(['Sales deck']));
      expect(screen.getByRole('button', { name: /^Remove filter: Updated since / })).toBeTruthy();

      // The owner an AI search found by name has no id: it shows as a removable chip.
      await user.click(screen.getByRole('button', { name: 'Remove filter: By ada' }));
      expect(app.location()).toBe(`/?q=deck&type=pdf&updatedFrom=${since}`);
    });

    it('moves to the tab the description asks for', async () => {
      api.enableAi(() => ({ interpreted: true, filters: { scope: 'shared', owner: 'Bob' } }));
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');

      await aiSearch(user, "Bob's work");
      expect(app.location()).toBe('/?scope=shared&owner=Bob');
      expect(await screen.findByRole('heading', { name: 'Shared with me', level: 1 })).toBeTruthy();
    });

    it('searches for the words when AI cannot read them', async () => {
      api.enableAi((q, scope) => ({ interpreted: false, filters: { scope: scope as 'mine', q } }));
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');

      await aiSearch(user, 'sales');
      expect(app.location()).toBe('/?q=sales');
      await waitFor(() => expect(shown()).toEqual(['Sales deck']));
    });

    it('offers AI search only when AI is on', async () => {
      renderApp('/');
      await screen.findByText('3 artifacts');
      expect(screen.queryByRole('button', { name: 'AI search' })).toBeNull();
    });

    it('applies a search at once on Enter', async () => {
      const user = userEvent.setup();
      const app = renderApp('/');
      await screen.findByText('3 artifacts');

      await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'sales{Enter}');
      expect(app.location()).toBe('/?q=sales');
      expect(api.interpretRequests).toEqual([]);
    });

    it('keeps filters when paging, and keeps all but the tag when switching scope', async () => {
      for (let i = 1; i <= 25; i++) api.addArtifact(artifact(`Extra ${i}`, 10 + i));
      const app = renderApp('/?tag=alpha&type=html&sort=updated_asc');
      expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
        '/?type=html&tag=alpha&sort=updated_asc&page=2',
      );

      await userEvent
        .setup()
        .selectOptions(screen.getByRole('combobox', { name: 'Show' }), 'public');
      expect(app.location()).toBe('/?scope=public&type=html&sort=updated_asc');
    });
  });
});
