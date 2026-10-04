import { Injectable } from '@nestjs/common';
import type { SearchInterpretation, SearchInterpretQuery } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AiUnavailableError } from '../ai/ai.errors.js';
import { AiService } from '../ai/ai.service.js';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import type { Actor } from '../auth/auth.types.js';
import {
  SEARCH_SYSTEM_PROMPT,
  searchAnswerSchema,
  searchPrompt,
  toSearchFilters,
} from './search-interpretation.js';
import type { SearchContext } from './search.types.js';

/**
 * Natural-language search for the gallery (plan §9): the fast model turns what the user typed
 * into the list's filters (keywords with synonyms, scope, type, owner, dates), which the gallery then
 * lists like any other. Without AI, or when it fails, the text becomes a plain keyword search.
 * MCP has no use for it: the calling agent fills `find_artifacts`' filters itself.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly ai: AiService,
    private readonly artifacts: ArtifactsService,
    @InjectPinoLogger(SearchService.name) private readonly logger: PinoLogger,
  ) {}

  async interpret(actor: Actor, { q, scope }: SearchInterpretQuery): Promise<SearchInterpretation> {
    const fallback: SearchInterpretation = { interpreted: false, filters: { scope, q } };
    if (!this.ai.enabled) return fallback;

    const owners = await this.artifacts.listOwners(actor);
    const context: SearchContext = {
      text: q,
      scope,
      owners,
      today: new Date().toISOString().slice(0, 10),
    };
    try {
      const { output } = await this.ai.generate({
        purpose: 'search.interpret',
        tier: 'fast',
        system: SEARCH_SYSTEM_PROMPT,
        prompt: searchPrompt(context),
        schema: searchAnswerSchema,
        maxOutputTokens: 1024,
      });
      const filters = toSearchFilters(output, context);
      // Which filters were used, never their values: those are what the user typed.
      const used = Object.keys(filters).filter(
        (key) => key !== 'scope' && filters[key as keyof typeof filters] !== undefined,
      );
      this.logger.info({ userId: actor.userId, filters: used }, 'Search interpreted');
      return { interpreted: true, filters };
    } catch (error) {
      if (!(error instanceof AiUnavailableError)) throw error;
      this.logger.info(
        { userId: actor.userId, reason: error.reason },
        'Search not interpreted; plain keyword search',
      );
      return fallback;
    }
  }
}
