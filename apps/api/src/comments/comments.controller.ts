import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CommentListQuery,
  type CommentListResponse,
  type CommentResponse,
  type CreateCommentOptions,
  type UpdateCommentOptions,
  commentListQuerySchema,
  createCommentRequestSchema,
  updateCommentRequestSchema,
} from '@artifact-hub/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { toCommentDto, toCommentThreadDto } from './comment.entity.js';
import { CommentsService } from './comments.service.js';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** `?version=N` for one version's threads; `?include=open` leaves out resolved ones. */
  @Get('artifacts/:id/comments')
  async list(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Query(new ZodValidationPipe(commentListQuerySchema)) { version, include }: CommentListQuery,
  ): Promise<CommentListResponse> {
    const threads = await this.comments.list(actor, artifactId, { versionNo: version, include });
    return { items: threads.map(toCommentThreadDto) };
  }

  @Post('artifacts/:id/comments')
  async create(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Body(new ZodValidationPipe(createCommentRequestSchema)) options: CreateCommentOptions,
  ): Promise<CommentResponse> {
    return { comment: toCommentDto(await this.comments.create(actor, artifactId, options)) };
  }

  /** Edits the body, or resolves (`resolved: true`) or reopens a top-level comment. */
  @Patch('comments/:id')
  async update(
    @CurrentActor() actor: Actor,
    @Param('id') commentId: string,
    @Body(new ZodValidationPipe(updateCommentRequestSchema)) changes: UpdateCommentOptions,
  ): Promise<CommentResponse> {
    return { comment: toCommentDto(await this.comments.update(actor, commentId, changes)) };
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentActor() actor: Actor, @Param('id') commentId: string): Promise<void> {
    await this.comments.remove(actor, commentId);
  }
}
