import { Controller, Get, Query } from '@nestjs/common';
import {
  type SearchInterpretation,
  type SearchInterpretQuery,
  searchInterpretQuerySchema,
} from '@artifact-hub/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { AI_THROTTLER, UseThrottlers } from '../common/rate-limit/rate-limit.module.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { SearchService } from './search.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Turns a search typed in plain language into gallery filters. Never fails because of AI. */
  @Get('interpret')
  @UseThrottlers(AI_THROTTLER)
  interpret(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(searchInterpretQuerySchema)) query: SearchInterpretQuery,
  ): Promise<SearchInterpretation> {
    return this.search.interpret(actor, query);
  }
}
