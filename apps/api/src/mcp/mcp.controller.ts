import { Controller, Delete, Get, Post, Req, Res } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { Auth, CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { McpServerService } from './mcp-server.service.js';

/**
 * The MCP endpoint (Streamable HTTP, stateless): `POST /mcp` with an API token. Each request
 * gets its own server bound to the caller, so nothing is shared between users or requests.
 */
@Auth('api_token')
@Controller('mcp')
export class McpController {
  constructor(private readonly servers: McpServerService) {}

  @Post()
  async handle(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const server = this.servers.create(actor, String(req.id));
    // JSON responses, not SSE: every tool answers in one go.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** A stateless server has no stream to open. */
  @Get()
  openStream(@Res() res: Response): void {
    methodNotAllowed(res);
  }

  /** A stateless server has no session to end. */
  @Delete()
  endSession(@Res() res: Response): void {
    methodNotAllowed(res);
  }
}

function methodNotAllowed(res: Response): void {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed: send JSON-RPC requests with POST.' },
      id: null,
    });
}
