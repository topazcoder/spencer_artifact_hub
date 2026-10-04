import Anthropic, {
  APIConnectionError,
  APIUserAbortError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AiOutputError, AiProviderError } from '../ai.errors.js';
import type { AiProviderRequest } from '../ai.types.js';
import { AnthropicProviderService } from './anthropic-provider.service.js';

const request: AiProviderRequest = {
  model: 'claude-test',
  system: 'Answer.',
  prompt: 'Question',
  schema: z.object({ answer: z.string() }),
  maxOutputTokens: 100,
  signal: new AbortController().signal,
};

function message(overrides: Partial<Anthropic.Message>): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-test-1',
    content: [{ type: 'text', text: '{"answer":"yes"}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  } as Anthropic.Message;
}

function setup(result: () => Promise<Anthropic.Message>) {
  const create = vi.fn(result);
  const client = { messages: { create } } as unknown as Anthropic;
  return { provider: new AnthropicProviderService('key', client), create };
}

describe('AnthropicProviderService', () => {
  it('asks for structured output in the schema, and returns the parsed answer', async () => {
    const { provider, create } = setup(async () => message({}));
    expect(await provider.generate(request)).toEqual({
      output: { answer: 'yes' },
      model: 'claude-test-1',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const [params, options] = create.mock.calls[0] as unknown as [
      Anthropic.MessageCreateParamsNonStreaming,
      { signal: AbortSignal },
    ];
    expect(params).toMatchObject({
      model: 'claude-test',
      max_tokens: 100,
      system: 'Answer.',
      messages: [{ role: 'user', content: 'Question' }],
      output_config: { format: { type: 'json_schema' } },
    });
    expect(options.signal).toBe(request.signal);
  });

  it.each([
    ['refusal', 'refused'],
    ['max_tokens', 'truncated'],
  ] as const)('reports a %s stop as an unusable answer', async (stopReason, problem) => {
    const { provider } = setup(async () => message({ stop_reason: stopReason }));
    await expect(provider.generate(request)).rejects.toMatchObject({ problem });
  });

  it('reports an answer that is not JSON as unusable', async () => {
    const { provider } = setup(async () =>
      message({ content: [{ type: 'text', text: 'Sure!', citations: null }] }),
    );
    await expect(provider.generate(request)).rejects.toBeInstanceOf(AiOutputError);
  });

  it.each([
    ['a rate limit', new RateLimitError(429, undefined, 'slow down', new Headers()), true],
    ['a server error', new InternalServerError(529, undefined, 'overloaded', new Headers()), true],
    ['a network failure', new APIConnectionError({ message: 'reset' }), true],
    ['a bad request', new BadRequestError(400, undefined, 'bad', new Headers()), false],
    ['an abort', new APIUserAbortError(), false],
  ])('maps %s to a provider error', async (_name, error, retryable) => {
    const { provider } = setup(() => Promise.reject(error));
    const caught = await provider.generate(request).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(AiProviderError);
    expect((caught as AiProviderError).retryable).toBe(retryable);
  });
});
