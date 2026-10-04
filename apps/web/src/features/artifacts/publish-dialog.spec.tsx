// @vitest-environment jsdom
import { ErrorCode } from '@artifact-hub/shared';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

const HTML = '<!doctype html><html><body>Pricing</body></html>';

async function openDialog() {
  const user = userEvent.setup();
  const app = renderApp('/');
  await user.click(await screen.findByRole('button', { name: 'Publish' }));
  await screen.findByRole('dialog', { name: 'Publish an artifact' });
  return { user, app };
}

const file = (name = 'pricing-page.html', content = HTML) =>
  new File([content], name, { type: 'text/html' });

describe('publish dialog', () => {
  let api: ReturnType<typeof installFakeApi>;

  beforeEach(() => {
    api = installFakeApi();
    api.signIn(api.addAccount('ada@example.com', 'correct horse'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('publishes the file with its details and opens the new artifact', async () => {
    const { user, app } = await openDialog();
    await user.upload(screen.getByLabelText('File'), file());

    // The title defaults to the file name without its extension.
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    expect(title.value).toBe('pricing-page');
    await user.clear(title);
    await user.type(title, 'Pricing page');
    await user.type(screen.getByLabelText('Description'), 'New tiers');
    await user.type(screen.getByLabelText('Tags'), 'Marketing, q3, marketing');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('heading', { name: 'Pricing page', level: 1 })).toBeTruthy();
    expect(app.location()).toMatch(/^\/artifacts\/[0-9a-f-]{36}$/);
    expect(screen.queryByRole('dialog')).toBeNull();

    const [form] = api.publishedForms;
    // The server reads the metadata before the file.
    expect([...form!.keys()]).toEqual(['metadata', 'file']);
    expect(JSON.parse(String(form!.get('metadata')))).toEqual({
      title: 'Pricing page',
      description: 'New tiers',
      tags: ['marketing', 'q3'],
    });
    expect((form!.get('file') as File).name).toBe('pricing-page.html');
  });

  it('retries a publish the server failed, with the same Idempotency-Key', async () => {
    const { user } = await openDialog();
    await user.upload(screen.getByLabelText('File'), file());
    api.failNextPublish(503, ErrorCode.SERVICE_UNAVAILABLE, 'Try again.');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    // After the retry delay (1 s).
    const heading = { name: 'pricing-page', level: 1 };
    expect(await screen.findByRole('heading', heading, { timeout: 3000 })).toBeTruthy();

    const keys = api.fetchMock.mock.calls
      .filter(([url, init]) => url === '/api/artifacts' && init?.method === 'POST')
      .map(
        ([, init]) => (init?.headers as Record<string, string> | undefined)?.['Idempotency-Key'],
      );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('keeps a title the user typed when a file is chosen afterwards', async () => {
    const { user } = await openDialog();
    await user.type(screen.getByLabelText('Title'), 'My title');
    await user.upload(screen.getByLabelText('File'), file());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My title');
  });

  it('asks for a file and a title before sending anything', async () => {
    const { user } = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Choose a file to publish.')).toBeTruthy();
    expect(screen.getByText('Enter a title.')).toBeTruthy();
    expect(api.publishedForms).toHaveLength(0);
  });

  it('rejects a file over the server limit without uploading it', async () => {
    api.setMaxArtifactBytes(1024);
    const { user } = await openDialog();
    await screen.findByText(/up to 1 KB/);
    await user.upload(screen.getByLabelText('File'), file('big.html', 'x'.repeat(2048)));

    expect(await screen.findByText('This file is 2 KB. The limit is 1 KB.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(api.publishedForms).toHaveLength(0);
  });

  it('shows a type the server rejects next to the file, and stays open', async () => {
    api.failNextPublish(415, ErrorCode.UNSUPPORTED_TYPE, 'The file does not contain HTML markup.');
    const { user } = await openDialog();
    await user.upload(screen.getByLabelText('File'), file('notes.html', 'plain text'));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('The file does not contain HTML markup.')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText('File').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows server validation errors on their fields', async () => {
    api.failNextPublish(400, ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
      { path: 'tags.0', message: 'Tags cannot contain commas or control characters.' },
    ]);
    const { user } = await openDialog();
    await user.upload(screen.getByLabelText('File'), file());
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(
      await screen.findByText('Tags cannot contain commas or control characters.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Tags').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the new artifact in the gallery afterwards', async () => {
    const { user } = await openDialog();
    await user.upload(screen.getByLabelText('File'), file());
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByRole('heading', { name: 'pricing-page', level: 1 });

    await user.click(screen.getAllByRole('link', { name: 'Artifact Hub' })[0]!);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'pricing-page', level: 2 })).toBeTruthy(),
    );
  });
});
