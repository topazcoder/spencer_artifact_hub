// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeAuthApi } from '@/test/fake-auth-api.ts';
import { renderApp } from '@/test/render-app.tsx';
import { currentUserQueryKey } from './auth-api.ts';

const EMAIL = 'ada@example.com';
const PASSWORD = 'correct horse';

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

async function fillSignup(name: string, email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('auth flow', () => {
  let api: ReturnType<typeof installFakeAuthApi>;

  beforeEach(() => {
    api = installFakeAuthApi();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('protected routes', () => {
    it('send signed-out users to login, remembering where they were going', async () => {
      const app = renderApp('/artifacts/42?tab=versions');
      await screen.findByRole('heading', { name: 'Log in' });
      expect(app.location()).toBe(
        `/login?next=${encodeURIComponent('/artifacts/42?tab=versions')}`,
      );
    });

    it('send signed-out users from home to plain /login', async () => {
      const app = renderApp('/');
      await screen.findByRole('heading', { name: 'Log in' });
      expect(app.location()).toBe('/login');
    });

    it('render the app shell for signed-in users', async () => {
      api.signIn(api.addAccount(EMAIL, PASSWORD));
      renderApp('/');
      expect(await screen.findByRole('heading', { name: 'Welcome, Ada Lovelace' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Account menu' }).textContent).toContain('AL');
    });

    it('show unknown paths as not found, inside the app shell', async () => {
      api.signIn(api.addAccount(EMAIL, PASSWORD));
      renderApp('/nope');
      expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    });
  });

  describe('login', () => {
    it('logs in and continues to the page from ?next=', async () => {
      api.addAccount(EMAIL, PASSWORD);
      const app = renderApp('/settings');
      await fillLogin(EMAIL, PASSWORD);
      await waitFor(() => expect(app.location()).toBe('/settings'));
    });

    it('ignores a ?next= that points to another site', async () => {
      api.addAccount(EMAIL, PASSWORD);
      const app = renderApp('/login?next=//evil.test/phish');
      await fillLogin(EMAIL, PASSWORD);
      await screen.findByRole('heading', { name: 'Welcome, Ada Lovelace' });
      expect(app.location()).toBe('/');
    });

    it('shows wrong credentials as a form error', async () => {
      api.addAccount(EMAIL, PASSWORD);
      renderApp('/login');
      await fillLogin(EMAIL, 'wrong password');
      expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password.');
    });

    it('validates fields before calling the API', async () => {
      renderApp('/login');
      await fillLogin('not-an-email', 'x');
      expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
      expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
      expect(api.calls('POST /api/auth/login')).toBe(0);
    });

    it('redirects signed-in users away from the login page', async () => {
      api.signIn(api.addAccount(EMAIL, PASSWORD));
      const app = renderApp('/login');
      await screen.findByRole('heading', { name: 'Welcome, Ada Lovelace' });
      expect(app.location()).toBe('/');
    });
  });

  describe('signup', () => {
    it('creates the account and signs in', async () => {
      renderApp('/signup');
      await fillSignup('Grace Hopper', ' Grace@Example.com ', PASSWORD);
      expect(await screen.findByRole('heading', { name: 'Welcome, Grace Hopper' })).toBeTruthy();
      // The shared schema normalized the email before it was sent.
      const [, init] = api.fetchMock.mock.calls.find(([url]) => url === '/api/auth/signup')!;
      expect(JSON.parse(String(init?.body)).email).toBe('grace@example.com');
    });

    it('shows a taken email next to the email field', async () => {
      api.addAccount(EMAIL, PASSWORD);
      renderApp('/signup');
      await fillSignup('Ada', EMAIL, PASSWORD);
      expect(await screen.findByText('An account with this email already exists.')).toBeTruthy();
      expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    });

    it('keeps ?next= when switching to login', async () => {
      renderApp('/signup?next=%2Fartifacts%2F1');
      const link = await screen.findByRole('link', { name: 'Log in' });
      expect(link.getAttribute('href')).toBe('/login?next=%2Fartifacts%2F1');
    });
  });

  describe('session end', () => {
    it('logs out from the account menu', async () => {
      api.signIn(api.addAccount(EMAIL, PASSWORD));
      const app = renderApp('/');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Account menu' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));
      await screen.findByRole('heading', { name: 'Log in' });
      expect(app.location()).toBe('/login');
      expect(api.calls('POST /api/auth/logout')).toBe(1);
    });

    it('sends the user to login when any request reports an expired session', async () => {
      api.signIn(api.addAccount(EMAIL, PASSWORD));
      const app = renderApp('/');
      await screen.findByRole('heading', { name: 'Welcome, Ada Lovelace' });

      api.expireSession();
      await app.queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      await screen.findByRole('heading', { name: 'Log in' });
    });
  });
});
