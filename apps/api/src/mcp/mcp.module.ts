import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { CommentsModule } from '../comments/comments.module.js';
import { SharingModule } from '../sharing/sharing.module.js';
import { ArtifactToolsService } from './artifacts/artifact-tools.service.js';
import { FeedbackToolsService } from './feedback/feedback-tools.service.js';
import { McpController } from './mcp.controller.js';
import { MCP_TOOL_PROVIDERS, McpServerService } from './mcp-server.service.js';
import type { McpToolProvider } from './mcp.types.js';

/** Tool groups, by concern. Each tool calls the same services as the REST API. */
const TOOL_PROVIDERS = [ArtifactToolsService, FeedbackToolsService];

@Module({
  imports: [ArtifactsModule, CommentsModule, SharingModule],
  controllers: [McpController],
  providers: [
    ...TOOL_PROVIDERS,
    {
      provide: MCP_TOOL_PROVIDERS,
      useFactory: (...providers: McpToolProvider[]) => providers,
      inject: TOOL_PROVIDERS,
    },
    McpServerService,
  ],
})
export class McpModule {}
