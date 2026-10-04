import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/app-shell.tsx';
import { GuestOnly, RequireAuth } from '@/components/route-guards.tsx';
import { ArtifactPage } from './artifact-page.tsx';
import { GalleryPage } from './gallery-page.tsx';
import { LoginPage } from './login-page.tsx';
import { NotFoundPage } from './not-found-page.tsx';
import { SettingsPage } from './settings-page.tsx';
import { SharedLinkPage } from './shared-link-page.tsx';
import { SignupPage } from './signup-page.tsx';
import { UploadPage } from './upload-page.tsx';

/** Everything requires a session except login, signup and share links. */
export const routes: RouteObject[] = [
  // Works signed in or not: share links are for people without an account too.
  { path: '/s/:token', element: <SharedLinkPage /> },
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
          { index: true, element: <GalleryPage /> },
          { path: 'artifacts/:id', element: <ArtifactPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'upload/:token', element: <UploadPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
