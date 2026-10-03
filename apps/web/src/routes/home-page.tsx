import { useCurrentUser } from '@/features/auth/use-auth.ts';

/** Placeholder until the gallery (step 10). */
export function HomePage() {
  const { data: user } = useCurrentUser();

  return (
    <section className="grid gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user?.displayName}</h1>
      <p className="text-muted-foreground">
        Artifacts you publish or that are shared with you will show up here.
      </p>
    </section>
  );
}
