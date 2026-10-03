// @vitest-environment jsdom
import { type Artifact, type ArtifactVersion, ErrorCode, type User } from '@artifact-hub/shared';
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
    sha256: 'a'.repeat(64),
    originalFilename: 'pricing.html',
    changeNote: null,
    createdAt: new Date().toISOString(),
  };
}

function open(item: Artifact, path = '') {
  return { user: userEvent.setup(), app: renderApp(`/artifacts/${item.id}${path}`) };
}

const thread = (author: string) => screen.findByRole('article', { name: `Comment by ${author}` });

describe('Feedback tab', () => {
  let api: ReturnType<typeof installFakeApi>;
  let me: User;
  let grace: User;

  beforeEach(() => {
    api = installFakeApi();
    me = api.addAccount('ada@example.com', 'correct horse', 'Ada Lovelace');
    grace = api.addAccount('grace@example.com', 'correct horse', 'Grace Hopper');
    api.signIn(me);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** An HTML artifact with versions 1 and 2, owned by me unless `owner` is given. */
  function artifactWithVersions(owner: User = me): Artifact {
    const versions = [version(1), version(2)];
    const now = new Date().toISOString();
    const item: Artifact = {
      id: crypto.randomUUID(),
      title: 'Pricing page',
      description: '',
      tags: [],
      visibility: 'private',
      status: 'published',
      metadataSource: 'user',
      owner: { id: owner.id, displayName: owner.displayName },
      currentVersion: versions[1]!,
      latestVersionNo: 2,
      permissions: { comment: true, edit: true, share: true, delete: true },
      createdAt: now,
      updatedAt: now,
    };
    api.addArtifact(item, '<p>hi</p>', versions);
    return item;
  }

  it('opens on the comments of the version being viewed, oldest first', async () => {
    const item = artifactWithVersions();
    const first = api.addComment(item.id, grace, 'The header looks off');
    api.addComment(item.id, me, 'Fixed in the next one', { parentId: first });
    api.addComment(item.id, me, 'Second thought');
    api.addComment(item.id, grace, 'On the old one', { versionNo: 1 });
    open(item);

    const list = await screen.findByRole('list', { name: 'Comments' });
    const threads = [...list.children] as HTMLElement[];
    expect(threads).toHaveLength(2);
    expect(within(threads[0]!).getByText('The header looks off')).toBeTruthy();
    expect(within(threads[1]!).getByText('Second thought')).toBeTruthy();
    expect(screen.queryByText('On the old one')).toBeNull();
    const filter = screen.getByRole('group', { name: 'Show feedback for:' });
    expect(
      within(filter)
        .getByRole('button', { name: 'This version (v2)' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    // Under the comment box.
    const box = screen.getByRole('textbox', { name: 'Add a comment' });
    expect(box.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('folds replies away until asked for', async () => {
    const item = artifactWithVersions();
    const first = api.addComment(item.id, grace, 'The header looks off');
    api.addComment(item.id, me, 'Fixed in the next one', { parentId: first });
    api.addComment(item.id, grace, 'Thanks', { parentId: first });
    const { user } = open(item);

    const toggle = await screen.findByRole('button', { name: '2 replies' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Fixed in the next one')).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const replies = screen.getByRole('list', { name: 'Replies' });
    expect(toggle.getAttribute('aria-controls')).toBe(replies.id);
    expect(
      within(replies)
        .getAllByRole('article')
        .map((r) => r.textContent),
    ).toEqual([
      expect.stringContaining('Fixed in the next one'),
      expect.stringContaining('Thanks'),
    ]);

    await user.click(toggle);
    expect(screen.queryByRole('list', { name: 'Replies' })).toBeNull();
  });

  it('shows every version on request, each linking to its version', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, grace, 'On the old one', { versionNo: 1 });
    api.addComment(item.id, grace, 'On the new one');
    const { user, app } = open(item);

    expect(await screen.findByText('On the new one')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'All versions' }));
    expect(await screen.findByText('On the old one')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'On version 2' }).getAttribute('href')).toBe(
      `/artifacts/${item.id}`,
    );

    await user.click(screen.getByRole('link', { name: 'On version 1' }));
    expect(app.location()).toBe(`/artifacts/${item.id}?v=1`);
  });

  it('follows the version picked in the page', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, grace, 'On the old one', { versionNo: 1 });
    open(item, '?v=1');

    expect(await screen.findByText('On the old one')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This version (v1)' })).toBeTruthy();
    expect(screen.getByPlaceholderText('Comment on v1…')).toBeTruthy();
  });

  it('says when there are no comments yet', async () => {
    open(artifactWithVersions());
    expect(await screen.findByText('No comments on v2 yet.')).toBeTruthy();
  });

  it('shows comments as plain text, with web links opening in a new tab', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, grace, '<img src=x onerror=alert(1)> see https://example.com/spec.');
    open(item);

    expect(await screen.findByText(/<img src=x onerror=alert\(1\)> see/)).toBeTruthy();
    expect(document.querySelector('img[onerror]')).toBeNull();
    const link = screen.getByRole('link', { name: 'https://example.com/spec' });
    expect(link.getAttribute('href')).toBe('https://example.com/spec');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('adds a comment on the version being viewed and clears the box', async () => {
    const item = artifactWithVersions();
    const { user } = open(item, '?v=1');

    const box = await screen.findByRole('textbox', { name: 'Add a comment' });
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveProperty('disabled', true);
    await user.type(box, 'Logo is blurry');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await thread('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Logo is blurry')).toBeTruthy();
    expect(box).toHaveProperty('value', '');
    expect(api.comments()).toMatchObject([{ body: 'Logo is blurry', versionNo: 1 }]);
  });

  it('shows the server’s reasons for refusing a comment under the box', async () => {
    const item = artifactWithVersions();
    const { user } = open(item);
    api.failNextComment(400, ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
      { path: 'body', message: 'Keep comments to 5000 characters.' },
    ]);
    await user.type(await screen.findByRole('textbox', { name: 'Add a comment' }), 'Too long');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    expect(await screen.findByText('Keep comments to 5000 characters.')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveProperty(
      'value',
      'Too long',
    );
  });

  it('replies to a thread, unfolding its replies to show the conversation', async () => {
    const item = artifactWithVersions();
    const first = api.addComment(item.id, grace, 'The header looks off');
    api.addComment(item.id, grace, 'Also the footer', { parentId: first });
    const { user } = open(item);

    expect(await screen.findByRole('button', { name: '1 reply' })).toBeTruthy();
    expect(screen.queryByText('Also the footer')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Also the footer')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Reply' }), 'Fixed both');
    await user.click(screen.getByRole('button', { name: 'Reply' }));

    expect(await screen.findByRole('button', { name: '2 replies' })).toBeTruthy();
    const replies = screen.getByRole('list', { name: 'Replies' });
    expect(within(replies).getByText('Fixed both')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Reply' })).toBeNull();
    expect(api.comments()[2]).toMatchObject({ parentId: first, body: 'Fixed both' });
  });

  it('lists resolved and open comments together, oldest first', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, grace, 'Done already', { resolved: true });
    api.addComment(item.id, grace, 'Still open');
    open(item);

    const list = await screen.findByRole('list', { name: 'Comments' });
    const threads = [...list.children] as HTMLElement[];
    expect(threads.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Resolved.*Done already/),
      expect.not.stringContaining('Resolved'),
    ]);
  });

  it('resolves my comment in place, and reopens it', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, me, 'Logo is blurry');
    const { user } = open(item);

    const comment = await thread('Ada Lovelace');
    await user.click(within(comment).getByRole('button', { name: 'Resolve' }));
    expect(await within(comment).findByText('Resolved')).toBeTruthy();
    expect(within(comment).getByText('Logo is blurry')).toBeTruthy();

    await user.click(within(comment).getByRole('button', { name: 'Reopen' }));
    expect(await within(comment).findByRole('button', { name: 'Resolve' })).toBeTruthy();
    expect(within(comment).queryByText('Resolved')).toBeNull();
  });

  it('edits my comment and marks it as edited', async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, me, 'Typo hree');
    const { user } = open(item);

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const box = screen.getByRole('textbox', { name: 'Edit comment' });
    await user.clear(box);
    await user.type(box, 'Typo here');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Typo here')).toBeTruthy();
    expect(screen.getByText('(edited)')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Edit comment' })).toBeNull();
  });

  it('deletes my comment with its replies after confirming', async () => {
    const item = artifactWithVersions();
    const top = api.addComment(item.id, me, 'Logo is blurry');
    api.addComment(item.id, grace, 'Agreed', { parentId: top });
    const { user } = open(item);

    const comment = await thread('Ada Lovelace');
    await user.click(within(comment).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete this comment?' });
    expect(within(confirm).getByText('It is removed for everyone, with its reply.')).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No comments on v2 yet.')).toBeTruthy();
    expect(screen.queryByText('Agreed')).toBeNull();
  });

  it("offers no actions on other people's comments", async () => {
    const item = artifactWithVersions();
    api.addComment(item.id, grace, 'The header looks off');
    open(item);

    const comment = await thread('Grace Hopper');
    for (const name of ['Resolve', 'Edit', 'Delete']) {
      expect(within(comment).queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy();
  });

  it('lets people who can only view read the comments, nothing more', async () => {
    const item = artifactWithVersions(grace);
    api.shareWith(item.id, me, 'view');
    api.addComment(item.id, grace, 'The header looks off');
    open(item);

    expect(await screen.findByText('The header looks off')).toBeTruthy();
    expect(screen.getByText('You can read the comments, but not add any.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Add a comment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('shows the comments as they are when a change fails', async () => {
    const item = artifactWithVersions();
    const id = api.addComment(item.id, me, 'Soon gone elsewhere');
    const { user } = open(item);

    await screen.findByText('Soon gone elsewhere');
    api.deleteComment(id);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(screen.queryByText('Soon gone elsewhere')).toBeNull());
    expect(await screen.findByText('No comments on v2 yet.')).toBeTruthy();
  });
});
