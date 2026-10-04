import { APP_NAME, type User } from '@artifact-hub/shared';
import { FilesIcon, LogOutIcon, MenuIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ComponentType, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar.tsx';
import { Button } from '@/components/ui/button.tsx';
import { DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog.tsx';
import { PublishDialog } from '@/features/artifacts/publish-dialog.tsx';
import { useLogout } from '@/features/auth/use-auth.ts';
import { describeError } from '@/lib/api/api-error.ts';
import { cn } from '@/lib/utils';

/** Where the sidebar stops being a menu you open: Tailwind's `md`. */
const WIDE_SCREEN = '(min-width: 768px)';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters
    .map((part) => part?.[0] ?? '')
    .join('')
    .toUpperCase();
}

const MENU: {
  label: string;
  to: string;
  icon: ComponentType<{ 'aria-hidden'?: boolean }>;
  /** Whether this item stands for the page at `pathname`. */
  isActive: (pathname: string) => boolean;
}[] = [
  {
    label: 'Artifacts',
    to: '/',
    icon: FilesIcon,
    isActive: (pathname) => pathname === '/' || pathname.startsWith('/artifacts/'),
  },
  {
    label: 'Settings',
    to: '/settings',
    icon: SettingsIcon,
    isActive: (pathname) => pathname.startsWith('/settings'),
  },
];

/**
 * The signed-in navigation. From `md` up it is a column beside the page; below, a bar with a
 * button that opens the same menu over the page.
 */
export function AppSidebar({ user }: { user: User }) {
  const [open, setOpen] = useState(false);

  // The menu is a column on wide screens: an open one would only lock the page.
  useEffect(() => {
    const wide = window.matchMedia?.(WIDE_SCREEN);
    if (!wide) return;
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <aside className="hidden p-4 md:sticky md:top-0 md:flex md:h-svh md:w-64 md:shrink-0 md:flex-col md:gap-4 md:border-r">
        <SidebarContent user={user} />
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <MenuIcon aria-hidden="true" />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPortal>
            <DialogOverlay />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r bg-background p-4 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
            >
              <DialogTitle className="sr-only">Menu</DialogTitle>
              <SidebarContent user={user} onNavigate={() => setOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPortal>
        </DialogPrimitive.Root>
        <Link to="/" className="text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
      </header>
    </>
  );
}

/** The platform name, the user, publishing, the menu and log out. */
function SidebarContent({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const logout = useLogout();
  const { pathname } = useLocation();

  // After logout the signed-in user is cleared, and the protected route redirects to login.
  const onLogout = () =>
    logout.mutate(undefined, {
      onError: (error) => toast.error(`Couldn't log out. ${describeError(error)}`),
    });

  return (
    <>
      <Link to="/" onClick={onNavigate} className="text-lg font-semibold tracking-tight">
        {APP_NAME}
      </Link>

      <div className="flex items-center gap-3" aria-label="Signed in user" role="group">
        <Avatar className="size-9">
          <AvatarFallback className="text-xs">{initials(user.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
      </div>

      <PublishDialog>
        <Button size="sm">
          <PlusIcon aria-hidden="true" />
          Publish
        </Button>
      </PublishDialog>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {MENU.map(({ label, to, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-4',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <Icon aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <Button
        variant="ghost"
        className="justify-start text-muted-foreground"
        onClick={onLogout}
        disabled={logout.isPending}
      >
        <LogOutIcon aria-hidden="true" />
        Log out
      </Button>
    </>
  );
}
