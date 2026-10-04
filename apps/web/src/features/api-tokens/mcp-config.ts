/** Name of the server in MCP client configs. */
const SERVER_NAME = 'artifact-hub';
/** Stands in for the token in the setup snippets until one is created. */
export const TOKEN_PLACEHOLDER = 'ah_your_token';

export function mcpEndpoint(origin: string): string {
  return `${origin}/mcp`;
}

/**
 * Claude Desktop config: `mcp-remote` bridges its stdio to our HTTP endpoint. The header is
 * passed through an env variable because some clients split arguments on spaces.
 */
export function claudeDesktopConfig(origin: string, token: string): string {
  const config = {
    mcpServers: {
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
    },
  };
  return JSON.stringify(config, null, 2);
}

/** Claude Code talks HTTP directly. */
export function claudeCodeCommand(origin: string, token: string): string {
  return `claude mcp add --transport http ${SERVER_NAME} ${mcpEndpoint(origin)} --header "Authorization: Bearer ${token}"`;
}
