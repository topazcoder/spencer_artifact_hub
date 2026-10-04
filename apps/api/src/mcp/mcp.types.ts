import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Actor } from '../auth/auth.types.js';

/**
 * What a tool returns: facts as data, for the agent to word for the user. Sent as
 * `structuredContent` and as JSON text (some clients show the model only text). Has the
 * artifact's `url` where there is one, and `next_actions`: what the agent can do next.
 */
export type ToolOutput = Record<string, unknown> & { next_actions: string[] };

/**
 * An MCP tool: thin, like a controller. It parses what the agent sent, calls the application
 * services with the actor, and words the result for a model.
 */
export interface McpTool<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  /** Written the way users ask for things, saying when to use the tool. */
  description: string;
  inputSchema: Shape;
  annotations: ToolAnnotations;
  /** Throws `AppError` for anything the agent should be told; `McpServerService` words it. */
  handler(actor: Actor, input: z.output<z.ZodObject<Shape>>): Promise<ToolOutput>;
}

/** Provides a group of related tools to `McpServerService`. */
export interface McpToolProvider {
  tools(): McpTool[];
}

/** An artifact named by the agent: its id, and the version if the URL had one (`?v=N`). */
export interface ArtifactRef {
  id: string;
  versionNo?: number;
}

/** `AppError` details a tool can set to replace the generic hint added to its message. */
export interface ToolErrorDetails {
  hint: string;
}
