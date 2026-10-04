import Anthropic, { APIConnectionError, APIError, APIUserAbortError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { AiOutputError, AiProviderError } from '../ai.errors.js';
import type { AiProvider, AiProviderRequest, AiProviderResponse } from '../ai.types.js';

/** Claude through the Messages API, with structured output in the request's schema. */
export class AnthropicProviderService implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey: string, client?: Anthropic) {
    // No SDK retries: `AiService` retries within the call's deadline, the same for every provider.
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 0 });
  }

  async generate({
    model,
    system,
    prompt,
    schema,
    maxOutputTokens,
    signal,
  }: AiProviderRequest): Promise<AiProviderResponse> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create(
        {
          model,
          max_tokens: maxOutputTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(schema) },
        },
        { signal },
      );
    } catch (error) {
      throw toProviderError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new AiOutputError('refused', 'The model declined to answer.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new AiOutputError('truncated', 'The answer was cut off at the token limit.');
    }
    const text = message.content.find((block) => block.type === 'text');
    let output: unknown;
    try {
      output = JSON.parse(text?.text ?? '');
    } catch {
      throw new AiOutputError('invalid_output', 'The answer was not JSON.');
    }
    return {
      output,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  }
}

/** SDK errors as `AiProviderError`s, retryable when the same call may pass. Others unchanged. */
function toProviderError(error: unknown): unknown {
  // Aborted by our deadline: no time left to retry.
  if (error instanceof APIUserAbortError) {
    return new AiProviderError('Anthropic call aborted', { retryable: false, cause: error });
  }
  // Network failures and the SDK's own timeouts.
  if (error instanceof APIConnectionError) {
    return new AiProviderError('Could not reach Anthropic', { retryable: true, cause: error });
  }
  if (error instanceof APIError) {
    const status = error.status ?? 0;
    return new AiProviderError(`Anthropic answered ${status}`, {
      retryable: status === 408 || status === 409 || status === 429 || status >= 500,
      cause: error,
    });
  }
  return error;
}
