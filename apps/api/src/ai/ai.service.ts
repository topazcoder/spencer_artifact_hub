import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { AiOutputError, AiProviderError, AiUnavailableError } from './ai.errors.js';
import { InjectAiProvider } from './ai-provider.js';
import type {
  AiProvider,
  AiProviderRequest,
  AiProviderResponse,
  AiRequest,
  AiResult,
} from './ai.types.js';
import { CircuitBreaker } from './circuit-breaker.js';

/**
 * The one way features call an LLM (plan §9.1). Every call has a deadline (retry included),
 * is retried once on a retryable error, and is skipped while the circuit breaker is open after
 * repeated failures. Answers are validated against the feature's schema. Any failure is an
 * `AiUnavailableError`, which features catch to fall back: AI never fails a user's request.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly breaker: CircuitBreaker;

  constructor(
    @InjectAiProvider() private readonly provider: AiProvider | null,
    @InjectEnv() private readonly env: Env,
    @InjectPinoLogger(AiService.name) private readonly logger: PinoLogger,
  ) {
    this.breaker = new CircuitBreaker(
      env.AI_CIRCUIT_FAILURE_THRESHOLD,
      env.AI_CIRCUIT_COOLDOWN_SECONDS * 1000,
    );
  }

  onModuleInit(): void {
    if (this.provider) return;
    const reason = this.env.AI_ENABLED ? 'no API key for the provider' : 'AI_ENABLED=false';
    this.logger.warn(
      { provider: this.env.AI_PROVIDER, reason },
      'AI is off; AI features fall back',
    );
  }

  /** Whether AI is configured. Calls can still fail; features fall back then. */
  get enabled(): boolean {
    return this.provider !== null;
  }

  /** One answer in the shape of `request.schema`. Throws `AiUnavailableError` on any failure. */
  async generate<T extends z.ZodType>(request: AiRequest<T>): Promise<AiResult<z.output<T>>> {
    if (!this.provider) throw new AiUnavailableError('disabled', 'AI is not configured.');
    const smart = request.tier === 'smart';
    const model = smart ? this.env.AI_MODEL_SMART : this.env.AI_MODEL_FAST;
    const log = { purpose: request.purpose, provider: this.provider.name, model };
    if (!this.breaker.tryAcquire()) {
      this.logger.debug(log, 'AI call skipped: paused after repeated failures');
      throw new AiUnavailableError('circuit_open', 'AI is paused after repeated failures.');
    }

    const signal = AbortSignal.timeout(
      smart ? this.env.AI_SMART_TIMEOUT_MS : this.env.AI_TIMEOUT_MS,
    );
    const started = performance.now();
    const ms = () => Math.round(performance.now() - started);
    let response: AiProviderResponse;
    try {
      response = await this.callWithRetry(this.provider, {
        model,
        system: request.system,
        prompt: request.prompt,
        schema: request.schema,
        maxOutputTokens: request.maxOutputTokens,
        signal,
      });
    } catch (error) {
      if (error instanceof AiOutputError) {
        // The provider works; the answer was unusable.
        this.breaker.recordSuccess();
        this.logger.warn({ ...log, outcome: error.problem, ms: ms() }, 'AI answer unusable');
        throw new AiUnavailableError(error.problem, error.message, { cause: error });
      }
      const opened = this.breaker.recordFailure();
      const reason = signal.aborted ? 'timeout' : 'provider_error';
      this.logger.warn({ ...log, outcome: reason, ms: ms(), err: error }, 'AI call failed');
      if (opened) {
        this.logger.warn(
          { ...log, code: 'AI_UNAVAILABLE', cooldownSeconds: this.env.AI_CIRCUIT_COOLDOWN_SECONDS },
          'AI calls paused after repeated failures',
        );
      }
      throw new AiUnavailableError(reason, 'The AI call failed.', { cause: error });
    }
    this.breaker.recordSuccess();

    const parsed = request.schema.safeParse(response.output);
    const usage = { ...log, model: response.model, ...response.usage, ms: ms() };
    if (!parsed.success) {
      this.logger.warn(
        { ...usage, outcome: 'invalid_output', issues: parsed.error.issues.length },
        'AI answer unusable',
      );
      throw new AiUnavailableError('invalid_output', 'The AI answer was not in the asked shape.');
    }
    this.logger.info({ ...usage, outcome: 'ok' }, 'AI call succeeded');
    return { output: parsed.data, model: response.model };
  }

  /** Tries again once if the first attempt failed in a way that may pass, while time is left. */
  private async callWithRetry(
    provider: AiProvider,
    request: AiProviderRequest,
  ): Promise<AiProviderResponse> {
    try {
      return await untilAborted(provider.generate(request), request.signal);
    } catch (error) {
      if (!(error instanceof AiProviderError) || !error.retryable || request.signal.aborted) {
        throw error;
      }
      this.logger.info({ model: request.model, err: error }, 'AI call retried');
      return await untilAborted(provider.generate(request), request.signal);
    }
  }
}

/** `promise`, or a rejection once `signal` aborts, for providers that don't stop in time. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
