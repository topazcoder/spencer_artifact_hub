import { ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { McpServerService, UNTRUSTED_NOTE } from './mcp-server.service.js';
import type { McpTool } from './mcp.types.js';

const actor: Actor = { userId: 'u1', via: 'mcp' };
const noop = async () => ({ next_actions: [] });

function tool(name: string, handler: McpTool['handler']): McpTool {
  return { name, title: name, description: name, inputSchema: {}, annotations: {}, handler };
}

function serviceWith(...tools: McpTool[]) {
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new McpServerService([{ tools: () => tools }], logger as unknown as PinoLogger);
  return { service, logger };
}

describe('McpServerService', () => {
  it('returns the data as structured content and as JSON text, with the untrusted note', async () => {
    const ok = tool('ok', async () => ({ url: 'https://x', next_actions: ['Next'] }));
    const { service, logger } = serviceWith(ok);
    const result = await service.call(ok, actor, {}, 'req-1');
    const data = { url: 'https://x', next_actions: ['Next'], note: UNTRUSTED_NOTE };
    expect(result).toEqual({
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'ok', userId: 'u1', outcome: 'ok' }),
      'MCP tool call',
    );
  });

  it('says what to do when something is not found', async () => {
    const missing = tool('missing', async () => {
      throw new AppError(ErrorCode.NOT_FOUND, 'Artifact not found.');
    });
    const result = await serviceWith(missing).service.call(missing, actor, {}, 'req-1');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: "Artifact not found. It may not exist, or you don't have access to it. Find artifacts with find_artifacts, and comment ids with get_feedback.",
      },
    ]);
  });

  it("uses the tool's own hint instead of the generic one", async () => {
    const missing = tool('missing', async () => {
      throw new AppError(ErrorCode.NOT_FOUND, 'Version 9 not found.', { hint: 'Try v1.' });
    });
    const result = await serviceWith(missing).service.call(missing, actor, {}, 'req-1');
    expect(result.content).toEqual([{ type: 'text', text: 'Version 9 not found. Try v1.' }]);
  });

  it('says what was wrong with a validation error', async () => {
    const invalid = tool('invalid', async () => {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'versionNo', message: 'There is no version 5.' },
      ]);
    });
    const result = await serviceWith(invalid).service.call(invalid, actor, {}, 'req-1');
    expect(result.content).toEqual([{ type: 'text', text: 'There is no version 5.' }]);
  });

  it('passes other domain errors on as they are', async () => {
    const forbidden = tool('forbidden', async () => {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only the owner can share it.');
    });
    const result = await serviceWith(forbidden).service.call(forbidden, actor, {}, 'req-1');
    expect(result).toMatchObject({
      isError: true,
      content: [{ text: 'Only the owner can share it.' }],
    });
  });

  it('hides unexpected errors behind the request ID, and logs them', async () => {
    const broken = tool('broken', async () => {
      throw new Error('connection reset: secret internals');
    });
    const { service, logger } = serviceWith(broken);
    const result = await service.call(broken, actor, {}, 'req-42');
    expect(result).toMatchObject({ isError: true });
    expect(JSON.stringify(result)).not.toContain('secret internals');
    expect(JSON.stringify(result)).toContain('req-42');
    expect(logger.error).toHaveBeenCalled();
  });

  it('refuses two tools with one name', () => {
    expect(() => serviceWith(tool('same', noop), tool('same', noop))).toThrow(/Two MCP tools/);
  });
});
