import type { z } from 'zod';

/** `fast`: quick, simple tasks. `smart`: tasks that need judgment. Each maps to a model in env. */
export type AiModelTier = 'fast' | 'smart';

/** What a feature asks AI for: one answer in the shape of `schema`. */
export interface AiRequest<T extends z.ZodType> {
  /** Names the feature in logs, e.g. `search.interpret`. */
  purpose: string;
  tier: AiModelTier;
  /** The instructions; the same on every call of a feature. */
  system: string;
  /** The task's input. Text written by users goes in `untrustedBlock`s. */
  prompt: string;
  /** The answer's shape: the provider asks for it, and `AiService` validates the answer. */
  schema: T;
  maxOutputTokens: number;
}

/** A validated answer. */
export interface AiResult<T> {
  output: T;
  /** The model that answered, as the provider reports it. */
  model: string;
}

/** One call to a provider, as `AiService` makes it. */
export interface AiProviderRequest {
  /** Provider-specific model id. */
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType;
  maxOutputTokens: number;
  /** Aborted at the call's deadline. */
  signal: AbortSignal;
}

export interface AiProviderResponse {
  /** The answer, parsed from JSON but not validated yet. */
  output: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * An LLM provider (Anthropic, OpenAI, …), selected by `AI_PROVIDER`. It makes one call with
 * structured output, and nothing else: retries, deadlines, the circuit breaker and validation
 * are `AiService`'s, the same for every provider. Throws `AiProviderError` when the call fails,
 * and `AiOutputError` when the model answered with something unusable.
 */
export interface AiProvider {
  /** For logs. */
  readonly name: string;
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}

/** Why AI gave no answer. */
export type AiFailureReason =
  'disabled' | 'circuit_open' | 'timeout' | 'provider_error' | AiOutputProblem;

/** How an answer was unusable: declined, cut off at the token limit, or not in the asked shape. */
export type AiOutputProblem = 'refused' | 'truncated' | 'invalid_output';
