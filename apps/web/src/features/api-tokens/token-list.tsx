import type { ApiToken } from '@artifact-hub/shared';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { Button, buttonVariants } from '@/components/ui/button.tsx';
import { formatRelativeTime } from '@/lib/format.ts';
import { toastError } from '@/lib/toast-error.ts';
import { useApiTokens, useRevokeApiToken } from './use-api-tokens.ts';

/** The user's live tokens, each with a way to revoke it. */
export function TokenList() {
  const { data: tokens, error, refetch } = useApiTokens();
  const revoke = useRevokeApiToken();

  if (error) return <InlineError error={error} onRetry={() => void refetch()} />;
  if (!tokens) return <InlineLoading />;
  if (tokens.length === 0) {
    return <p className="text-sm text-muted-foreground">You don't have any API tokens yet.</p>;
  }

  return (
    <ul className="divide-y rounded-lg border" aria-label="API tokens">
      {tokens.map((token) => (
        <li key={token.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span className="grid min-w-0 flex-1 basis-48 gap-0.5">
            <span className="truncate font-medium">{token.name}</span>
            <span className="text-xs text-muted-foreground">
              <code className="font-mono">{token.prefix}…</code> · Created{' '}
              {formatRelativeTime(token.createdAt)} ·{' '}
              {token.lastUsedAt
                ? `Last used ${formatRelativeTime(token.lastUsedAt)}`
                : 'Never used'}
            </span>
          </span>
          <RevokeButton
            token={token}
            disabled={revoke.isPending && revoke.variables === token.id}
            onConfirm={() =>
              revoke.mutate(token.id, {
                onSuccess: () => toast.success(`Revoked “${token.name}”`),
                onError: toastError,
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

function RevokeButton({
  token,
  disabled,
  onConfirm,
}: {
  token: ApiToken;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Revoke ${token.name}`}>
          <Trash2Icon aria-hidden="true" />
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke “{token.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops working right away. Any MCP client or script using it will need a new token.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onConfirm}
          >
            Revoke
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
