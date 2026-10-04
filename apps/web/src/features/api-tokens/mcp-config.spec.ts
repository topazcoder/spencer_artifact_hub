import { describe, expect, it } from 'vitest';
import { claudeCodeCommand, claudeDesktopConfig } from './mcp-config.ts';

const ORIGIN = 'https://hub.example.com';
const TOKEN = 'ah_secret';

describe('claudeDesktopConfig', () => {
  it('points mcp-remote at the endpoint, with the token in its env', () => {
    expect(JSON.parse(claudeDesktopConfig(ORIGIN, TOKEN))).toEqual({
      mcpServers: {
        'artifact-hub': {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote',
            'https://hub.example.com/mcp',
            '--header',
            'Authorization:${ARTIFACT_HUB_AUTH}',
          ],
          env: { ARTIFACT_HUB_AUTH: 'Bearer ah_secret' },
        },
      },
    });
  });
});

describe('claudeCodeCommand', () => {
  it('adds the HTTP server with the Bearer header', () => {
    expect(claudeCodeCommand(ORIGIN, TOKEN)).toBe(
      'claude mcp add --transport http artifact-hub https://hub.example.com/mcp --header "Authorization: Bearer ah_secret"',
    );
  });
});
