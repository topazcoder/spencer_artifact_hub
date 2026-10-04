import type { z } from 'zod';
import type { McpTool } from './mcp.types.js';

/** Types a tool's handler input from its schema, then widens it for the tool list. */
export function defineTool<Shape extends z.ZodRawShape>(tool: McpTool<Shape>): McpTool {
  return tool as unknown as McpTool;
}
