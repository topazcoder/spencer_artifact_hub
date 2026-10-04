// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeApi } from '@/test/fake-api.ts';
import { renderApp } from '@/test/render-app.tsx';

describe('sidebar on small screens', () => {
  beforeEach(() => {
    const api = installFakeApi();
    api.signIn(api.addAccount('ada@example.com', 'correct horse'));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('opens from the menu button, with the same menu, and closes when you go somewhere', async () => {
    const user = userEvent.setup();
    const app = renderApp('/');
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    const menu = await screen.findByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('group', { name: 'Signed in user' }).textContent).toContain(
      'ada@example.com',
    );
    expect(within(menu).getByRole('button', { name: 'Log out' })).toBeTruthy();

    await user.click(within(menu).getByRole('link', { name: 'Settings' }));
    expect(app.location()).toBe('/settings');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog', { name: 'Menu' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
  });
});
