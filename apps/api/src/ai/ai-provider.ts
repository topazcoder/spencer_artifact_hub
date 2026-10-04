import { Inject } from '@nestjs/common';
import type { Env } from '../config/config.types.js';
import { AnthropicProviderService } from './anthropic/anthropic-provider.service.js';
import type { AiProvider } from './ai.types.js';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** Injects the configured `AiProvider`, or null when AI is off. Features use `AiService`. */
export const InjectAiProvider = () => Inject(AI_PROVIDER);

/**
 * Builds the provider selected by `AI_PROVIDER`. Null when AI is off: `AI_ENABLED=false`, or no
 * API key for the provider (the app works fully without AI).
 */
export function createAiProvider(env: Env): AiProvider | null {
  if (!env.AI_ENABLED) return null;
  switch (env.AI_PROVIDER) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? new AnthropicProviderService(env.ANTHROPIC_API_KEY) : null;
    case 'openai':
      // The AiProvider interface is the extension point; see docs/ENHANCEMENTS.md.
      throw new Error('AI_PROVIDER=openai is not implemented yet; use "anthropic"');
  }
}
