// @vitest-environment jsdom
import {
  type Artifact,
  type ArtifactMimeType,
  type ArtifactVersion,
  ErrorCode,
  type User,
} from '@artifact-hub/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

// pdf.js needs a real canvas; the page only has to pick the PDF viewer.
vi.mock('./viewers/pdf-viewer.tsx', () => ({
  default: ({ contentPath }: { contentPath: string }) => <p>PDF viewer for {contentPath}</p>,
}));

function artifact(mimeType: ArtifactMimeType, overrides: Partial<Artifact> = {}): Artifact {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'Pricing page',
    description: 'Draft of the new pricing page',
    tags: ['marketing', 'q3'],
    visibility: 'private',
    status: 'published',
    metadataSource: 'user',
    owner: { id: crypto.randomUUID(), displayName: 'Grace Hopper' },
    currentVersion: {
      id: crypto.randomUUID(),
      versionNo: 2,
      mimeType,
      sizeBytes: 1536,
      sha256: 'a'.repeat(64),
      originalFilename: 'pricing.html',
      changeNote: null,
      createdAt: now,
    },
    latestVersionNo: 2,
    permissions: { comment: true, edit: true, share: true, delete: true },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Opens the Details tab; the page opens on Feedback. */
async function openDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Details' }));
}

describe('artifact page', () => {
  let api: ReturnType<typeof installFakeApi>;

  beforeEach(() => {
    api = installFakeApi();
    api.signIn(api.addAccount('ada@example.com', 'correct horse'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function show(item: Artifact, content?: string) {
    api.addArtifact(item, content);
    return renderApp(`/artifacts/${item.id}`);
  }

  it('shows the metadata and a download link for the current version', async () => {
    const item = artifact('text/html');
    show(item);

    expect(await screen.findByRole('heading', { name: 'Pricing page' })).toBeTruthy();
    await openDetails(userEvent.setup());
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.getByText('v2')).toBeTruthy();
    expect(screen.getByText('HTML, 1.5 KB')).toBeTruthy();
    expect(screen.getByText('Private')).toBeTruthy();
    expect(screen.getByText('Draft of the new pricing page')).toBeTruthy();
    const tags = within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem');
    expect(tags.map((tag) => tag.textContent)).toEqual(['marketing', 'q3']);
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(
      `/api/artifacts/${item.id}/versions/2/content?download=1`,
    );
  });

  it('shows HTML in an iframe sandboxed without same-origin access', async () => {
    const item = artifact('text/html');
    show(item);

    const frame = await screen.findByTitle('Pricing page');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    expect(frame.getAttribute('src')).toBe(`/api/artifacts/${item.id}/versions/2/content`);
  });

  it.each(['image/png', 'image/svg+xml'] as const)('shows %s as an image', async (mimeType) => {
    const item = artifact(mimeType);
    show(item);

    const image = await screen.findByRole('img', { name: 'Pricing page' });
    expect(image.tagName).toBe('IMG');
    expect(image.getAttribute('src')).toBe(`/api/artifacts/${item.id}/versions/2/content`);
  });

  it('renders Markdown without letting it inject markup or script links', async () => {
    show(
      artifact('text/markdown'),
      [
        '# Release notes',
        '',
        '<img src="x" onerror="alert(1)">',
        '',
        '[docs](https://example.com/docs) and [bad](javascript:alert(1))',
      ].join('\n'),
    );

    expect(await screen.findByRole('heading', { name: 'Release notes' })).toBeTruthy();
    expect(document.querySelector('img[onerror]')).toBeNull();
    const docs = screen.getByRole('link', { name: 'docs' });
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('bad').getAttribute('href') ?? '').not.toContain('javascript');
  });

  it('uses the PDF viewer for PDFs', async () => {
    const item = artifact('application/pdf');
    show(item);
    expect(
      await screen.findByText(`PDF viewer for /artifacts/${item.id}/versions/2/content`),
    ).toBeTruthy();
  });

  it('explains a draft that has no content yet', async () => {
    show(artifact('text/html', { status: 'draft', currentVersion: null, latestVersionNo: 0 }));
    expect(await screen.findByText('This artifact is waiting for its first upload.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Download' })).toBeNull();
  });

  it('shows a not-found page for missing or inaccessible artifacts, without retrying', async () => {
    const id = crypto.randomUUID();
    renderApp(`/artifacts/${id}`);
    expect(await screen.findByRole('heading', { name: 'Artifact not found' })).toBeTruthy();
    expect(api.calls(`GET /api/artifacts/${id}`)).toBe(1);
  });
});

function version(versionNo: number, overrides: Partial<ArtifactVersion> = {}): ArtifactVersion {
  return {
    id: crypto.randomUUID(),
    versionNo,
    mimeType: 'text/html',
    sizeBytes: 1024 * versionNo,
    sha256: String(versionNo).repeat(64),
    originalFilename: 'pricing.html',
    changeNote: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('artifact page: versions and editing', () => {
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

  /** An HTML artifact with versions 1–3, owned by me unless `owner` says otherwise. */
  function showVersioned(path = '', owner?: Artifact['owner']) {
    const versions = [version(1), version(2, { changeNote: 'Tighter copy' }), version(3)];
    const item = artifact('text/html', {
      owner: owner ?? { id: me.id, displayName: me.displayName },
      currentVersion: versions[2]!,
      latestVersionNo: 3,
    });
    api.addArtifact(item, '<p>hi</p>', versions);
    return { item, user: userEvent.setup(), app: renderApp(`/artifacts/${item.id}${path}`) };
  }

  it('lists the versions, newest first, and shows an earlier one on request', async () => {
    const { item, user, app } = showVersioned();
    await user.click(await screen.findByRole('tab', { name: 'Versions' }));

    const list = await screen.findByRole('list', { name: 'Versions' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^v3Latest/),
      expect.stringMatching(/^v2.*Tighter copy/),
      expect.stringMatching(/^v1/),
    ]);
    expect(links[0]!.getAttribute('aria-current')).toBe('page');

    await user.click(links[2]!);
    expect(app.location()).toBe(`/artifacts/${item.id}?v=1`);
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      "You're viewing v1, an earlier version. Show the latest (v3)",
    );
    expect(screen.getByTitle('Pricing page').getAttribute('src')).toBe(
      `/api/artifacts/${item.id}/versions/1/content`,
    );
    expect(screen.getByRole('link', { name: 'Download' }).getAttribute('href')).toBe(
      `/api/artifacts/${item.id}/versions/1/content?download=1`,
    );

    await user.click(screen.getByRole('link', { name: 'Show the latest (v3)' }));
    expect(app.location()).toBe(`/artifacts/${item.id}`);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['?v=9', '?v=latest'])('says so when %s is not a version', async (query) => {
    showVersioned(query);
    expect(await screen.findByText("This version doesn't exist.")).toBeTruthy();
  });

  it('uploads a new version with a change note and shows it', async () => {
    const { user } = showVersioned('?v=1');
    await user.click(await screen.findByRole('button', { name: 'Upload new version' }));
    const dialog = await screen.findByRole('dialog', { name: 'Upload a new version' });
    expect(within(dialog).getByText(/It becomes v4 of “Pricing page”/)).toBeTruthy();

    await user.upload(
      within(dialog).getByLabelText('File'),
      new File(['<p>v4</p>'], 'v4.html', { type: 'text/html' }),
    );
    await user.type(within(dialog).getByLabelText('What changed?'), 'New hero');
    await user.click(within(dialog).getByRole('button', { name: 'Upload version' }));

    expect(await screen.findByText('v4')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    const [form] = api.publishedForms;
    expect([...form!.keys()]).toEqual(['metadata', 'file']);
    expect(JSON.parse(String(form!.get('metadata')))).toEqual({ changeNote: 'New hero' });
  });

  it('shows a rejected file next to the file picker', async () => {
    const { user } = showVersioned();
    await user.click(await screen.findByRole('button', { name: 'Upload new version' }));
    const dialog = await screen.findByRole('dialog');
    api.failNextPublish(415, ErrorCode.UNSUPPORTED_TYPE, 'This type of file is not supported.');
    await user.upload(within(dialog).getByLabelText('File'), new File(['x'], 'fake.png'));
    await user.click(within(dialog).getByRole('button', { name: 'Upload version' }));

    expect(await within(dialog).findByText('This type of file is not supported.')).toBeTruthy();
  });

  it('edits the details without creating a version', async () => {
    const { item, user } = showVersioned();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Pricing v2');
    const tags = screen.getByLabelText('Tags');
    await user.clear(tags);
    await user.type(tags, 'Launch, launch');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Pricing v2', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    const savedTags = within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem');
    expect(savedTags.map((tag) => tag.textContent)).toEqual(['launch']);
    expect(api.artifact(item.id)).toMatchObject({ title: 'Pricing v2', latestVersionNo: 3 });
  });

  it('shows validation errors from the server on their fields', async () => {
    const { user } = showVersioned();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    api.failNextUpdate(400, ErrorCode.VALIDATION_FAILED, 'Invalid request.', [
      { path: 'title', message: 'That title is taken.' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That title is taken.')).toBeTruthy();
  });

  it('deletes after confirming and goes home without refetching the artifact', async () => {
    const { item, user, app } = showVersioned();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete “Pricing page”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(app.location()).toBe('/'));
    expect(api.artifact(item.id)).toBeUndefined();
    expect(api.calls(`GET /api/artifacts/${item.id}`)).toBe(1);
  });

  it("hides the owner's actions from everyone else", async () => {
    const { user } = showVersioned('', { id: crypto.randomUUID(), displayName: 'Grace Hopper' });
    expect(await screen.findByRole('heading', { name: 'Pricing page' })).toBeTruthy();
    await openDetails(user);
    for (const name of ['Upload new version', 'Edit details', 'Delete']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});
