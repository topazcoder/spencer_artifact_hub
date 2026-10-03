import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { describeError } from '@/lib/api/api-error.ts';

export function PageLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-busy="true">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="max-w-md text-sm text-muted-foreground">
        {describeError(error)}
      </p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
