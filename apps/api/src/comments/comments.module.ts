import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { AiModule } from '../ai/ai.module.js';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { Comment } from './comment.entity.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { FeedbackSummariesController } from './summaries/feedback-summaries.controller.js';
import { FeedbackSummariesService } from './summaries/feedback-summaries.service.js';
import { FeedbackSummary } from './summaries/feedback-summary.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, ArtifactVersion, FeedbackSummary]),
    AccessModule,
    AiModule,
    ArtifactsModule,
    IdempotencyModule,
  ],
  controllers: [CommentsController, FeedbackSummariesController],
  providers: [CommentsService, FeedbackSummariesService],
  exports: [CommentsService],
})
export class CommentsModule {}
