import { CopyIcon } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { copyWithToast } from '@/lib/clipboard.ts';
import {
  CLAUDE_DESKTOP_HINT,
  claudeCodeCommand,
  claudeDesktopConfig,
  TOKEN_PLACEHOLDER,
} from './mcp-config.ts';

/** Ready-to-copy setup for MCP clients, with the new token filled in when there is one. */
export function McpSetup({ secret }: { secret: string | null }) {
  const origin = window.location.origin;
  const token = secret ?? TOKEN_PLACEHOLDER;

  return (
    <div className="grid gap-5">
      {secret ? null : (
        <p className="text-sm text-muted-foreground">
          Replace <code className="font-mono">{TOKEN_PLACEHOLDER}</code> with a token. Create one
          above to have it filled in.
        </p>
      )}
      <Snippet
        title="Claude Desktop"
        what="Config"
        hint={CLAUDE_DESKTOP_HINT}
        code={claudeDesktopConfig(origin, token)}
      />
      <Snippet
        title="Claude Code"
        what="Command"
        hint="Run this in a terminal."
        code={claudeCodeCommand(origin, token)}
      />
    </div>
  );
}

function Snippet({
  title,
  what,
  hint,
  code,
}: {
  title: string;
  /** What the copy button copies, for its toast. */
  what: string;
  hint: string;
  code: string;
}) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <div className="flex items-end justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Copy ${title} ${what.toLowerCase()}`}
          onClick={() => void copyWithToast(code, what)}
        >
          <CopyIcon aria-hidden="true" />
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs">
        <code>{code}</code>
      </pre>
    </section>
  );
}
