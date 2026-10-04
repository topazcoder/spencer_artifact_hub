// @vitest-environment jsdom
import { API_TOKENS_MAX } from '@artifact-hub/shared';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

function open() {
  return { user: userEvent.setup(), app: renderApp('/settings') };
}

describe('Settings page', () => {
  let api: ReturnType<typeof installFakeApi>;

  beforeEach(() => {
    api = installFakeApi();
    api.signIn(api.addAccount('ada@example.com', 'correct horse'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('is reached from the sidebar', async () => {
    const user = userEvent.setup();
    const app = renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'Settings' }));
    expect(app.location()).toBe('/settings');
    expect(await screen.findByRole('heading', { name: 'API tokens' })).toBeTruthy();
  });

  it('lists tokens with their prefix and last use', async () => {
    api.addApiToken('Old laptop', new Date(Date.now() - 2 * 3_600_000).toISOString());
    api.addApiToken('CI');
    open();
    const list = await screen.findByRole('list', { name: 'API tokens' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^CI.*ah_AbCdE….*Never used/),
      expect.stringMatching(/^Old laptop.*Last used 2 hours ago/),
    ]);
  });

  it('says when there are no tokens, and shows the setup with a placeholder', async () => {
    open();
    expect(await screen.findByText("You don't have any API tokens yet.")).toBeTruthy();
    const desktop = screen.getByRole('region', { name: 'Claude Desktop' });
    expect(desktop.textContent).toContain('Bearer ah_your_token');
    expect(desktop.textContent).toContain(`${window.location.origin}/mcp`);
  });

  it('creates a token, shows it once and fills it into the setup', async () => {
    const { user } = open();
    await user.type(await screen.findByLabelText('Token name'), 'Claude Desktop');
    await user.click(screen.getByRole('button', { name: 'Create token' }));

    const secretField = await screen.findByLabelText<HTMLInputElement>('New API token');
    const secret = secretField.value;
    expect(secret).toMatch(/^ah_/);
    expect(screen.getByLabelText<HTMLInputElement>('Token name').value).toBe('');
    expect(
      await within(screen.getByRole('list', { name: 'API tokens' })).findByText('Claude Desktop'),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Claude Code' }).textContent).toContain(
      `Authorization: Bearer ${secret}`,
    );

    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Copy token' }));
    expect(writeText).toHaveBeenCalledWith(secret);

    await user.click(screen.getByRole('button', { name: 'Copy Claude Code command with token' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(`Authorization: Bearer ${secret}`),
    );
    await user.click(screen.getByRole('button', { name: 'Copy Claude Desktop config with token' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`Bearer ${secret}`));

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('New API token')).toBeNull();
    expect(screen.getByRole('region', { name: 'Claude Code' }).textContent).not.toContain(secret);
  });

  it('asks for a name', async () => {
    const { user } = open();
    await user.click(await screen.findByRole('button', { name: 'Create token' }));
    expect(await screen.findByText('Give the token a name.')).toBeTruthy();
    expect(api.apiTokens()).toEqual([]);
  });

  it('revokes a token after confirming', async () => {
    api.addApiToken('Keep');
    api.addApiToken('Old laptop');
    const { user } = open();
    await user.click(await screen.findByRole('button', { name: 'Revoke Old laptop' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('It stops working right away');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByText('Old laptop')).toBeNull());
    expect(api.apiTokens().map((t) => t.name)).toEqual(['Keep']);
  });

  it('shows why a token could not be created', async () => {
    for (let i = 0; i < API_TOKENS_MAX; i++) api.addApiToken(`Token ${i}`);
    const { user } = open();
    await user.type(await screen.findByLabelText('Token name'), 'One more');
    await user.click(screen.getByRole('button', { name: 'Create token' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at most 20 API tokens/);
    expect(screen.queryByLabelText('New API token')).toBeNull();
  });
});
