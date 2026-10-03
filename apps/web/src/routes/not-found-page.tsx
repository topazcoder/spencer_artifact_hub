import { Link } from 'react-router';
import { Button } from '@/components/ui/button.tsx';

export function NotFoundPage() {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button asChild variant="outline">
        <Link to="/">Go home</Link>
      </Button>
    </section>
  );
}
