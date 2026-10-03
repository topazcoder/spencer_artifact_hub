// @vitest-environment jsdom
import type { Artifact, ArtifactVersion, User } from '@artifact-hub/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

function version(versionNo: number): ArtifactVersion {
  return {
    id: crypto.randomUUID(),
    versionNo,
    mimeType: 'text/html',
    sizeBytes: 100,
    sha256: String(versionNo).repeat(64),
    originalFilename: 'page.html',
    changeNote: null,
    createdAt: new Date().toISOString(),
  };
}

async function openDialog(item: Artifact) {
  const user = userEvent.setup();
  renderApp(`/artifacts/${item.id}`);
  await user.click(await screen.findByRole('button', { name: 'Share' }));
  const dialog = await screen.findByRole('dialog', { name: 'Share “Roadmap”' });
  await within(dialog).findByRole('tab', { name: /People/ });
  return { user, dialog };
}

function rows(dialog: HTMLElement) {
  const list = within(dialog).getByRole('list', { name: 'People with access' });
  return within(list).getAllByRole('listitem');
}

describe('share dialog', () => {
  let api: ReturnType<typeof installFakeApi>;
  let me: User;
  let grace: User;

  beforeEach(() => {
    api = installFakeApi();
    me = api.addAccount('ada@example.com', 'correct horse', 'Ada Lovelace');
    grace = api.addAccount('grace@example.com', 'pw', 'Grace Hopper');
    api.signIn(me);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** An artifact with two versions, mine unless `owner` says otherwise. */
  function artifact(owner: Artifact['owner'] = { id: me.id, displayName: me.displayName }) {
    const versions = [version(1), version(2)];
    const now = new Date().toISOString();
    const item: Artifact = {
      id: crypto.randomUUID(),
      title: 'Roadmap',
      description: '',
      tags: [],
      visibility: 'private',
      status: 'published',
      metadataSource: 'user',
      owner,
      currentVersion: versions[1]!,
      latestVersionNo: 2,
      permissions: { comment: true, edit: true, share: true, delete: true },
      createdAt: now,
      updatedAt: now,
    };
    api.addArtifact(item, '<p>hi</p>', versions);
    return item;
  }

  it('says who can see it, with a tab and an explanation for each kind of access', async () => {
    const { user, dialog } = await openDialog(artifact());
    expect(within(dialog).getByText('Only you can see it.')).toBeTruthy();
    expect(within(dialog).getByText('Not shared with anyone yet.')).toBeTruthy();
    expect(within(dialog).getByText(/Share with specific colleagues/)).toBeTruthy();

    await user.click(within(dialog).getByRole('tab', { name: 'Company' }));
    expect(within(dialog).getByText(/Anyone who signs in to Artifact Hub/)).toBeTruthy();
    expect(within(dialog).getByRole('switch', { name: 'Everyone at the company' })).toHaveProperty(
      'ariaChecked',
      'false',
    );
  });

  it('shares with people by email, with the chosen permission and version', async () => {
    const item = artifact();
    const { user, dialog } = await openDialog(item);

    await user.type(within(dialog).getByLabelText('Emails'), 'Grace@Example.com ');
    expect(within(dialog).getByText('grace@example.com')).toBeTruthy();
    await user.selectOptions(
      within(dialog).getByLabelText('Permission for new people'),
      'Can comment',
    );
    await within(dialog).findAllByRole('option', { name: 'Only v1' });
    await user.selectOptions(within(dialog).getByLabelText('Version for new people'), 'Only v1');
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(rows(dialog)).toHaveLength(1));
    expect(rows(dialog)[0]!.textContent).toContain('Grace Hopper');
    expect(within(dialog).getByText('You and 1 person can see it.')).toBeTruthy();
    expect(within(dialog).getByRole('tab', { name: /People/ }).textContent).toContain('1');
    expect(api.access(item.id).people).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: grace.id }),
        permission: 'comment',
        pinnedVersionNo: 1,
      }),
    ]);
    // The picker is ready for the next people.
    expect(within(dialog).queryByRole('button', { name: 'Remove grace@example.com' })).toBeNull();
  });

  it('suggests colleagues as you type', async () => {
    const { user, dialog } = await openDialog(artifact());
    await user.type(within(dialog).getByLabelText('Emails'), 'gra');

    await waitFor(() => {
      const options = [...document.querySelectorAll('datalist option')];
      expect(options.map((o) => [o.getAttribute('value'), o.textContent])).toEqual([
        ['grace@example.com', 'Grace Hopper'],
      ]);
    });
  });

  it('adds nobody when an email has no account, and marks it', async () => {
    const item = artifact();
    const { user, dialog } = await openDialog(item);
    await user.type(within(dialog).getByLabelText('Emails'), 'grace@example.com, nope@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));

    expect(
      await within(dialog).findByText(/No one at Artifact Hub has these emails: nope@example.com/),
    ).toBeTruthy();
    expect(api.access(item.id).people).toEqual([]);
    // Remove the unknown one and try again.
    await user.click(within(dialog).getByRole('button', { name: 'Remove nope@example.com' }));
    await user.click(within(dialog).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(api.access(item.id).people).toHaveLength(1));
  });

  it('rejects text that is not an email before sending', async () => {
    const item = artifact();
    const { user, dialog } = await openDialog(item);
    await user.type(within(dialog).getByLabelText('Emails'), 'grace{Enter}');
    expect(within(dialog).getByText("“grace” isn't an email address.")).toBeTruthy();
    expect(api.calls(`POST /api/artifacts/${item.id}/access/people`)).toBe(0);
  });

  it("changes and removes a person's access", async () => {
    const item = artifact();
    api.shareWith(item.id, grace);
    const { user, dialog } = await openDialog(item);

    await user.selectOptions(
      within(dialog).getByLabelText('Permission for Grace Hopper'),
      'Can comment',
    );
    await waitFor(() => expect(api.access(item.id).people[0]?.permission).toBe('comment'));
    await user.selectOptions(within(dialog).getByLabelText('Version for Grace Hopper'), 'Only v2');
    await waitFor(() => expect(api.access(item.id).people[0]?.pinnedVersionNo).toBe(2));

    await user.click(within(dialog).getByRole('button', { name: 'Remove Grace Hopper' }));
    await within(dialog).findByText('Not shared with anyone yet.');
    expect(api.access(item.id).people).toEqual([]);
  });

  it('shares with everyone at the company, optionally only one version', async () => {
    const item = artifact();
    const { user, dialog } = await openDialog(item);

    await user.click(within(dialog).getByRole('tab', { name: 'Company' }));
    await user.click(within(dialog).getByRole('switch', { name: 'Everyone at the company' }));
    await within(dialog).findByText('Everyone at the company can see it.');
    expect(within(dialog).getByRole('tab', { name: /Company/ }).textContent).toContain('On');
    expect(api.access(item.id).company).toEqual({ enabled: true, pinnedVersionNo: null });

    await user.selectOptions(
      within(dialog).getByLabelText('Version for everyone at the company'),
      'Only v1',
    );
    await waitFor(() => expect(api.access(item.id).company.pinnedVersionNo).toBe(1));

    await user.keyboard('{Escape}');
    expect(await screen.findByText('Company')).toBeTruthy();
  });

  it("copies the artifact's link for colleagues", async () => {
    const item = artifact();
    const { user, dialog } = await openDialog(item);
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/artifacts/${item.id}`);
  });

  it('is only offered to the owner', async () => {
    const item = artifact({ id: grace.id, displayName: grace.displayName });
    renderApp(`/artifacts/${item.id}`);
    expect(await screen.findByRole('heading', { name: 'Roadmap' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});
