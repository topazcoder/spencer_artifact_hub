import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { describeError } from '@/lib/api/api-error.ts';

/** A spinner that fills its container (a viewer, a list), unlike the full-page `PageLoading`. */
export function InlineLoading() {
  return (
    <div className="flex size-full items-center justify-center" aria-busy="true">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

/** An error message with an optional retry, filling its container. */
export function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p role="alert" className="max-w-md text-sm text-muted-foreground">
        {typeof error === 'string' ? error : describeError(error)}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
