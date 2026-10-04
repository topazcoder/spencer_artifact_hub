import type { AiProvider, AiProviderRequest, AiProviderResponse } from '../src/ai/ai.types.js';

/**
 * An `AiProvider` for e2e tests: answers with what `answer` returns for each request (or throws
 * what it throws), and records the requests.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly requests: AiProviderRequest[] = [];
  answer: (request: AiProviderRequest) => unknown = () => {
    throw new Error('No answer set');
  };

  generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    this.requests.push(request);
    try {
      return Promise.resolve({
        output: this.answer(request),
        model: request.model,
        usage: { inputTokens: 1, outputTokens: 1 },
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
