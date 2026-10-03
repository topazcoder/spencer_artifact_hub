import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/app-shell.tsx';
import { GuestOnly, RequireAuth } from '@/components/route-guards.tsx';
import { HomePage } from './home-page.tsx';
import { LoginPage } from './login-page.tsx';
import { NotFoundPage } from './not-found-page.tsx';
import { SignupPage } from './signup-page.tsx';

/** Everything requires a session except login and signup. */
export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
