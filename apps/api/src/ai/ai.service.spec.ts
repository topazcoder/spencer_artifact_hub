import type { PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import type { Env } from '../config/config.types.js';
import { AiOutputError, AiProviderError, AiUnavailableError } from './ai.errors.js';
import { AiService } from './ai.service.js';
import type { AiProvider, AiProviderRequest, AiRequest } from './ai.types.js';

const ENV = {
  AI_ENABLED: true,
  AI_PROVIDER: 'anthropic',
  AI_MODEL_FAST: 'fast-model',
  AI_MODEL_SMART: 'smart-model',
  AI_TIMEOUT_MS: 50,
  AI_SMART_TIMEOUT_MS: 100,
  AI_CIRCUIT_FAILURE_THRESHOLD: 2,
  AI_CIRCUIT_COOLDOWN_SECONDS: 60,
} as Env;

const schema = z.object({ answer: z.string() });

const request: AiRequest<typeof schema> = {
  purpose: 'test',
  tier: 'fast',
  system: 'Answer.',
  prompt: 'Question',
  schema,
  maxOutputTokens: 100,
};

/** A provider whose calls run `steps` in turn (the last one repeats). */
function provider(...steps: Array<(req: AiProviderRequest) => Promise<unknown>>) {
  let call = 0;
  const generate = vi.fn(async (req: AiProviderRequest) => {
    const step = steps[Math.min(call++, steps.length - 1)]!;
    return {
      output: await step(req),
      model: `${req.model}-v1`,
      usage: { inputTokens: 3, outputTokens: 4 },
    };
  });
  return { name: 'fake', generate } satisfies AiProvider;
}

const answers = (output: unknown) => () => Promise.resolve(output);
const fails = (error: Error) => () => Promise.reject(error);
const hangs = () => () => new Promise<never>(() => {});
const retryable = () => new AiProviderError('overloaded', { retryable: true });
const final = () => new AiProviderError('bad request', { retryable: false });

function setup(ai: AiProvider | null) {
  const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return { service: new AiService(ai, ENV, logger as unknown as PinoLogger), logger };
}

async function failure(promise: Promise<unknown>): Promise<AiUnavailableError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AiUnavailableError);
  return error as AiUnavailableError;
}

describe('AiService', () => {
  it('is disabled without a provider, and says so once at boot', async () => {
    const { service, logger } = setup(null);
    service.onModuleInit();
    expect(service.enabled).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect((await failure(service.generate(request))).reason).toBe('disabled');
  });

  it('returns the validated answer, from the tier’s model', async () => {
    const ai = provider(answers({ answer: 'yes' }));
    const { service, logger } = setup(ai);
    expect(await service.generate(request)).toEqual({
      output: { answer: 'yes' },
      model: 'fast-model-v1',
    });
    await service.generate({ ...request, tier: 'smart' });
    expect(ai.generate.mock.calls.map(([req]) => req.model)).toEqual(['fast-model', 'smart-model']);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'test', inputTokens: 3, outputTokens: 4, outcome: 'ok' }),
      'AI call succeeded',
    );
  });

  it('rejects an answer that does not fit the schema', async () => {
    const { service } = setup(provider(answers({ answer: 42 })));
    expect((await failure(service.generate(request))).reason).toBe('invalid_output');
  });

  it('retries once after a retryable error', async () => {
    const ai = provider(fails(retryable()), answers({ answer: 'yes' }));
    const { service } = setup(ai);
    expect((await service.generate(request)).output).toEqual({ answer: 'yes' });
    expect(ai.generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors, nor twice', async () => {
    const once = provider(fails(final()));
    expect((await failure(setup(once).service.generate(request))).reason).toBe('provider_error');
    expect(once.generate).toHaveBeenCalledTimes(1);

    const twice = provider(fails(retryable()));
    await failure(setup(twice).service.generate(request));
    expect(twice.generate).toHaveBeenCalledTimes(2);
  });

  it('gives up at the deadline, even if the provider never answers', async () => {
    const ai = provider(hangs());
    const { service } = setup(ai);
    expect((await failure(service.generate(request))).reason).toBe('timeout');
    expect(ai.generate.mock.calls[0]![0].signal.aborted).toBe(true);
  });

  it('pauses calls after repeated failures', async () => {
    const ai = provider(fails(final()));
    const { service, logger } = setup(ai);
    await failure(service.generate(request));
    await failure(service.generate(request));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_UNAVAILABLE' }),
      'AI calls paused after repeated failures',
    );
    expect((await failure(service.generate(request))).reason).toBe('circuit_open');
    expect(ai.generate).toHaveBeenCalledTimes(2);
  });

  it('does not count unusable answers as provider failures', async () => {
    const ai = provider(fails(new AiOutputError('refused', 'declined')));
    const { service } = setup(ai);
    for (let i = 0; i < 3; i++) {
      expect((await failure(service.generate(request))).reason).toBe('refused');
    }
    expect(ai.generate).toHaveBeenCalledTimes(3);
  });
});
