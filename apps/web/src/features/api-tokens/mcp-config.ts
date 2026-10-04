/** Name of the server in MCP client configs. */
const SERVER_NAME = 'artifact-hub';
/** Stands in for the token in the setup snippets until one is created. */
export const TOKEN_PLACEHOLDER = 'ah_your_token';

export function mcpEndpoint(origin: string): string {
  return `${origin}/mcp`;
}

/** Where the Claude Desktop entry goes, shown next to the snippet. */
export const CLAUDE_DESKTOP_HINT =
  'In Claude Desktop open Settings → Developer → Edit Config to open claude_desktop_config.json. Paste this inside the "mcpServers": { } braces, after a comma if it already has other servers (if there is no "mcpServers" yet, add "mcpServers": { and } around it). Save, then restart Claude Desktop.';

/**
 * The `"artifact-hub": { … }` entry for the `mcpServers` object of claude_desktop_config.json,
 * without the surrounding braces so it pastes in next to existing servers. `mcp-remote` bridges
 * Claude Desktop's stdio to our HTTP endpoint. The header is passed through an env variable
 * because some clients split arguments on spaces.
 */
export function claudeDesktopConfig(origin: string, token: string): string {
  const entry = {
    [SERVER_NAME]: {
      command: 'npx',
      args: [
        '-y',
        'mcp-remote',
        mcpEndpoint(origin),
        '--header',
        'Authorization:${ARTIFACT_HUB_AUTH}',
      ],
      env: { ARTIFACT_HUB_AUTH: `Bearer ${token}` },
    },
  };
  // Drop the wrapping object's braces and its one level of indentation.
  return JSON.stringify(entry, null, 2)
    .split('\n')
    .slice(1, -1)
    .map((line) => line.slice(2))
    .join('\n');
}

/** Claude Code talks HTTP directly. */
export function claudeCodeCommand(origin: string, token: string): string {
  return `claude mcp add --transport http ${SERVER_NAME} ${mcpEndpoint(origin)} --header "Authorization: Bearer ${token}"`;
}
