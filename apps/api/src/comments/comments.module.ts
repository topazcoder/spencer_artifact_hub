import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { Comment } from './comment.entity.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, ArtifactVersion]),
    AccessModule,
    ArtifactsModule,
    IdempotencyModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
