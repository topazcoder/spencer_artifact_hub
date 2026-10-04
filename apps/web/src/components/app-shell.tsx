import { Outlet } from 'react-router';
import { useCurrentUser } from '@/features/auth/use-auth.ts';
import { AppSidebar } from './app-sidebar.tsx';

/** Layout of every signed-in page. Rendered inside `RequireAuth`, so the user is known. */
export function AppShell() {
  const { data: user } = useCurrentUser();

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {user ? <AppSidebar user={user} /> : null}
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
