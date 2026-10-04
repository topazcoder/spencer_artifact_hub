import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  type FeedbackSummaryQuery,
  type FeedbackSummaryResponse,
  feedbackSummaryQuerySchema,
} from '@artifact-hub/shared';
import { CurrentActor } from '../../auth/auth.decorators.js';
import type { Actor } from '../../auth/auth.types.js';
import { AI_THROTTLER, UseThrottlers } from '../../common/rate-limit/rate-limit.module.js';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { FeedbackSummariesService } from './feedback-summaries.service.js';
import { toFeedbackSummaryResponse } from './feedback-summary.entity.js';

/** `?version=N` for one version's comments; none for every version the caller can see. */
@Controller('artifacts/:id/feedback-summary')
export class FeedbackSummariesController {
  constructor(private readonly summaries: FeedbackSummariesService) {}

  /** The saved summary, if any, and whether it's outdated. */
  @Get()
  async get(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Query(new ZodValidationPipe(feedbackSummaryQuerySchema)) query: FeedbackSummaryQuery,
  ): Promise<FeedbackSummaryResponse> {
    return toFeedbackSummaryResponse(await this.summaries.get(actor, artifactId, query));
  }

  /** Summarizes now (or returns the saved summary if comments haven't changed). */
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseThrottlers(AI_THROTTLER)
  async summarize(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Query(new ZodValidationPipe(feedbackSummaryQuerySchema)) query: FeedbackSummaryQuery,
  ): Promise<FeedbackSummaryResponse> {
    return toFeedbackSummaryResponse(await this.summaries.summarize(actor, artifactId, query));
  }
}
