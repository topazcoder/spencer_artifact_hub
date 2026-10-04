// @vitest-environment jsdom
import { type Artifact, ErrorCode, type User } from '@artifact-hub/shared';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

function open(token: string) {
  return { user: userEvent.setup(), app: renderApp(`/upload/${token}`) };
}

const png = () => new File(['png bytes'], 'chart.png', { type: 'image/png' });

describe('Upload page', () => {
  let api: ReturnType<typeof installFakeApi>;
  let me: User;

  beforeEach(() => {
    api = installFakeApi();
    me = api.addAccount('ada@example.com', 'correct horse', 'Ada Lovelace');
    api.signIn(me);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** An artifact of mine: a draft from MCP, or published with `versions` versions. */
  function artifact(versions = 0): Artifact {
    const now = new Date().toISOString();
    const history = Array.from({ length: versions }, (_, i) => ({
      id: crypto.randomUUID(),
      versionNo: i + 1,
      mimeType: 'application/pdf' as const,
      sizeBytes: 100,
      sha256: 'a'.repeat(64),
      originalFilename: 'q4.pdf',
      changeNote: null,
      createdAt: now,
    }));
    const item: Artifact = {
      id: crypto.randomUUID(),
      title: 'Q4 chart',
      description: '',
      tags: [],
      visibility: 'private',
      status: versions === 0 ? 'draft' : 'published',
      metadataSource: 'user',
      owner: { id: me.id, displayName: me.displayName },
      currentVersion: history.at(-1) ?? null,
      latestVersionNo: versions,
      permissions: { comment: true, edit: true, share: true, delete: true },
      createdAt: now,
      updatedAt: now,
    };
    api.addArtifact(item, '', history);
    return item;
  }

  it('publishes the file of a draft, then says the user can go back to their conversation', async () => {
    const item = artifact();
    const { user } = open(api.addUploadSession(item.id));
    expect(await screen.findByRole('heading', { name: 'Upload your file' })).toBeTruthy();
    expect(screen.getByText(/Your assistant created “Q4 chart”/)).toBeTruthy();

    await user.upload(screen.getByLabelText('File'), png());
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    expect(await screen.findByRole('heading', { name: 'Uploaded' })).toBeTruthy();
    expect(screen.getByText(/You can return to your conversation/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open it' }).getAttribute('href')).toBe(
      `/artifacts/${item.id}`,
    );
    expect(api.artifact(item.id)).toMatchObject({ status: 'published', latestVersionNo: 1 });
  });

  it('says which version a new file becomes, with the change note', async () => {
    const item = artifact(2);
    open(api.addUploadSession(item.id, { changeNote: 'Added December' }));
    expect(await screen.findByRole('heading', { name: 'Upload a new version' })).toBeTruthy();
    expect(screen.getByText(/It becomes v3 of “Q4 chart”/)).toBeTruthy();
    expect(screen.getByText('What changed: Added December')).toBeTruthy();
  });

  it('shows why a file was refused, and takes another', async () => {
    const item = artifact();
    const { user } = open(api.addUploadSession(item.id));
    api.failNextPublish(415, ErrorCode.UNSUPPORTED_TYPE, 'This file type is not supported.');

    await user.upload(await screen.findByLabelText('File'), png());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('This file type is not supported.')).toBeTruthy();

    await user.upload(screen.getByLabelText('File'), png());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('heading', { name: 'Uploaded' })).toBeTruthy();
  });

  it('asks for a file before uploading', async () => {
    const { user } = open(api.addUploadSession(artifact().id));
    await user.click(await screen.findByRole('button', { name: 'Upload' }));
    expect(screen.getByText('Choose a file to upload.')).toBeTruthy();
  });

  it('explains a link that has expired', async () => {
    open(api.addUploadSession(artifact().id, { expired: true }));
    expect(
      await screen.findByRole('heading', { name: 'This upload link has expired' }),
    ).toBeTruthy();
  });

  it("explains a link that doesn't work", async () => {
    open('not-a-real-token');
    expect(
      await screen.findByRole('heading', { name: "This upload link doesn't work" }),
    ).toBeTruthy();
  });

  it('says when the file is already in', async () => {
    const item = artifact();
    const token = api.addUploadSession(item.id);
    const first = open(token);
    await first.user.upload(await screen.findByLabelText('File'), png());
    await first.user.click(screen.getByRole('button', { name: 'Upload' }));
    await screen.findByRole('heading', { name: 'Uploaded' });
    cleanup();

    open(token);
    expect(await screen.findByRole('heading', { name: 'Already uploaded' })).toBeTruthy();
  });

  it('sends signed-out users to log in, then back here', async () => {
    const token = api.addUploadSession(artifact().id);
    api.expireSession();
    const { app } = open(token);
    await screen.findByRole('heading', { name: /log in/i });
    expect(app.location()).toBe(`/login?next=${encodeURIComponent(`/upload/${token}`)}`);
  });
});
