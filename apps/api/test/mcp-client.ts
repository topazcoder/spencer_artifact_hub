import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApiTokenResponseSchema } from '@artifact-hub/shared';
import request from 'supertest';
import { TEST_ORIGIN } from './test-env.js';
import type { TestUser } from './test-users.js';

/**
 * Structured content, typed for the parts the tests look into: each tool returns some of them.
 * Everything else is checked with `toMatchObject`.
 */
export interface ToolData extends Record<string, unknown> {
  items: { id: string }[];
  versions: { number: number }[];
  threads: { resolved: boolean }[];
  upload: { url: string; command: string; expires_at: string };
  next_actions: string[];
}

export interface ToolResult {
  text: string;
  data: ToolData;
  isError: boolean;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const first = result.content[0];
  return {
    text: first?.type === 'text' ? first.text : '',
    data: (result.structuredContent ?? {}) as ToolData,
    isError: result.isError === true,
  };
}

/**
 * Real MCP clients over HTTP, for the test app: starts it listening, gives each user one API
 * token (there is a cap on live tokens), and closes every client in `close()`.
 */
export async function mcpClients(app: NestExpressApplication) {
  await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const tokens = new Map<string, string>();
  const clients: Client[] = [];

  async function tokenFor(user: TestUser): Promise<string> {
    const existing = tokens.get(user.id);
    if (existing) return existing;
    const res = await request(app.getHttpServer())
      .post('/api/tokens')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', user.cookie)
      .send({ name: 'e2e' })
      .expect(201);
    const { secret } = createApiTokenResponseSchema.parse(res.body);
    tokens.set(user.id, secret);
    return secret;
  }

  return {
    baseUrl,
    tokenFor,
    async connect(user: TestUser): Promise<Client> {
      const client = new Client({ name: 'artifact-hub-e2e', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${await tokenFor(user)}` } },
      });
      await client.connect(transport);
      clients.push(client);
      return client;
    },
    async close(): Promise<void> {
      await Promise.all(clients.map((client) => client.close()));
    },
  };
}
