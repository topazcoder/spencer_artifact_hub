import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useCurrentUser } from '@/features/auth/use-auth.ts';
import { safeNextPath } from '@/lib/safe-redirect.ts';
import { PageError, PageLoading } from './page-status.tsx';

/** Renders child routes for signed-in users; sends everyone else to login, then back here. */
export function RequireAuth() {
  const { data: user, isPending, error, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={() => void refetch()} />;
  if (!user) {
    const here = `${location.pathname}${location.search}${location.hash}`;
    const to = here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`;
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}

/** Login and signup: signed-in users go on to `?next=` (when safe) or home. */
export function GuestOnly() {
  const { data: user, isPending, error, refetch } = useCurrentUser();
  const [searchParams] = useSearchParams();

  if (isPending) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={() => void refetch()} />;
  if (user) return <Navigate to={safeNextPath(searchParams.get('next')) ?? '/'} replace />;
  return <Outlet />;
}
