import { CopyIcon, KeyRoundIcon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { copyWithToast } from '@/lib/clipboard.ts';
import { claudeCodeCommand, claudeDesktopConfig } from './mcp-config.ts';

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
      <div className="grid gap-2">
        <CopyRow
          title="Claude Desktop"
          what="Config"
          hint="Paste into claude_desktop_config.json (Settings → Developer → Edit Config), then restart Claude Desktop."
          text={claudeDesktopConfig(window.location.origin, secret)}
        />
        <CopyRow
          title="Claude Code"
          what="Command"
          hint="Paste into a terminal."
          text={claudeCodeCommand(window.location.origin, secret)}
        />
      </div>
      <p className="text-muted-foreground">
        Both include your token. Anyone with it can act as you through MCP, so keep it private.
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

/** A setup the user copies without seeing it: its name, where to paste it, and a copy button. */
function CopyRow({
  title,
  what,
  hint,
  text,
}: {
  title: string;
  /** What gets copied, for the toast. */
  what: string;
  hint: string;
  text: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
      <div className="grid gap-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Copy ${title} ${what.toLowerCase()} with token`}
        onClick={() => void copyWithToast(text, what)}
      >
        <CopyIcon aria-hidden="true" />
        Copy
      </Button>
    </div>
  );
}
