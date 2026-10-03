// @vitest-environment jsdom
import type { Artifact, ArtifactMimeType } from '@artifact-hub/shared';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

// pdf.js needs a real canvas; the page only has to pick the PDF viewer.
vi.mock('./viewers/pdf-viewer.tsx', () => ({
  default: ({ versionNo }: { versionNo: number }) => <p>PDF viewer for v{versionNo}</p>,
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
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
    show(artifact('application/pdf'));
    expect(await screen.findByText('PDF viewer for v2')).toBeTruthy();
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
