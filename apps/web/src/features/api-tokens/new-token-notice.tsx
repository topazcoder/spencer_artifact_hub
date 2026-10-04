import { CopyIcon, KeyRoundIcon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { copyWithToast } from '@/lib/clipboard.ts';

/** The token just created. The server never returns it again, so this is the only chance. */
export function NewTokenNotice({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="grid gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm"
    >
      <p className="flex items-center gap-2 font-medium">
        <KeyRoundIcon className="size-4" aria-hidden="true" />
        Copy your new token now. You won't be able to see it again.
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={secret}
          aria-label="New API token"
          onFocus={(event) => event.target.select()}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          aria-label="Copy token"
          onClick={() => void copyWithToast(secret, 'Token')}
        >
          <CopyIcon aria-hidden="true" />
          Copy
        </Button>
      </div>
      <p className="text-muted-foreground">
        The setup below includes it. Anyone with this token can act as you through MCP, so keep it
        private.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="justify-self-end"
        onClick={onDismiss}
      >
        Done
      </Button>
    </div>
  );
}
