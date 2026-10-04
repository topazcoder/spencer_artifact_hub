import type { AiFailureReason, AiOutputProblem } from './ai.types.js';

/**
 * AI gave no usable answer: it is off, paused after repeated failures, too slow, failing, or
 * answered with something unusable. Thrown by `AiService` only; features catch it and fall back.
 */
export class AiUnavailableError extends Error {
  constructor(
    readonly reason: AiFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

/**
 * Thrown by providers when a call fails. `retryable` for rate limits, server errors, timeouts
 * and network failures: the same call may work if tried again.
 */
export class AiProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = 'AiProviderError';
    this.retryable = options.retryable;
  }
}

/** Thrown by providers when the model answered, but not with something usable. */
export class AiOutputError extends Error {
  constructor(
    readonly problem: AiOutputProblem,
    message: string,
  ) {
    super(message);
    this.name = 'AiOutputError';
  }
}
