import { useState } from 'react';
import { CreateTokenForm } from '@/features/api-tokens/create-token-form.tsx';
import { McpSetup } from '@/features/api-tokens/mcp-setup.tsx';
import { NewTokenNotice } from '@/features/api-tokens/new-token-notice.tsx';
import { TokenList } from '@/features/api-tokens/token-list.tsx';

/** Account settings: API tokens for MCP clients, and how to connect them. */
export function SettingsPage() {
  // Only held in memory: leaving the page forgets it, as the server never returns it again.
  const [newSecret, setNewSecret] = useState<string | null>(null);

  return (
    <div className="mx-auto grid max-w-3xl gap-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="grid gap-4" aria-labelledby="api-tokens-heading">
        <div className="grid gap-1">
          <h2 id="api-tokens-heading" className="text-lg font-medium">
            API tokens
          </h2>
          <p className="text-sm text-muted-foreground">
            Let AI assistants such as Claude publish, find and review artifacts as you, through MCP.
            Use a separate token for each app, so you can revoke one without the others.
          </p>
        </div>
        <CreateTokenForm onCreated={setNewSecret} />
        {newSecret ? (
          <NewTokenNotice secret={newSecret} onDismiss={() => setNewSecret(null)} />
        ) : null}
        <TokenList />
      </section>

      <section className="grid gap-4" aria-labelledby="mcp-setup-heading">
        <h2 id="mcp-setup-heading" className="text-lg font-medium">
          Connect an MCP client
        </h2>
        <McpSetup secret={newSecret} />
      </section>
    </div>
  );
}
