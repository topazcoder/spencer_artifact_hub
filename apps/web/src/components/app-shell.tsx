import { APP_NAME } from '@artifact-hub/shared';
import { PlusIcon } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { Button } from '@/components/ui/button.tsx';
import { PublishDialog } from '@/features/artifacts/publish-dialog.tsx';
import { useCurrentUser } from '@/features/auth/use-auth.ts';
import { UserMenu } from './user-menu.tsx';

/** Layout of every signed-in page. Rendered inside `RequireAuth`, so the user is known. */
export function AppShell() {
  const { data: user } = useCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-2">
            <PublishDialog>
              <Button size="sm">
                <PlusIcon aria-hidden="true" />
                Publish
              </Button>
            </PublishDialog>
            {user ? <UserMenu user={user} /> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
