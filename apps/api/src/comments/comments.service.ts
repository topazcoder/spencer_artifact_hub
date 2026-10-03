import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type CreateCommentOptions,
  ErrorCode,
  type UpdateCommentOptions,
} from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, IsNull, type Repository } from 'typeorm';
import { z } from 'zod';
import { AccessPolicyService } from '../access/access-policy.service.js';
import type { AccessTarget } from '../access/access.types.js';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import type { ArtifactView } from '../artifacts/artifacts.types.js';
import type { Actor } from '../auth/auth.types.js';
import { AppError } from '../common/errors/app-error.js';
import { Comment } from './comment.entity.js';
import type {
  CommentListOptions,
  CommentThreadView,
  CommentView,
  VisibleComment,
} from './comments.types.js';

const idSchema = z.guid();
const COMMENT_NOT_FOUND_MESSAGE = 'Comment not found.';

/**
 * Comments on artifact versions, with one level of replies (plan §1, §4). Everyone who can view
 * an artifact reads the comments on the versions they can see; writing needs the right to
 * comment. A comment is its author's alone to edit, resolve or delete (`AccessPolicy`).
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(ArtifactVersion) private readonly versions: Repository<ArtifactVersion>,
    private readonly artifacts: ArtifactsService,
    private readonly access: AccessPolicyService,
    @InjectPinoLogger(CommentsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * The threads on one version, or on every version the actor can see, oldest first. Deleted
   * comments are left out, and so are the replies of a deleted top-level comment.
   */
  async list(
    actor: Actor,
    artifactId: string,
    { versionNo, include }: CommentListOptions,
  ): Promise<CommentThreadView[]> {
    const view = await this.artifacts.get(actor, artifactId);
    const visible = this.access.visibleVersionIds(actor, view.target);
    let versionFilter = visible ? { versionId: In([...visible]) } : {};
    if (versionNo !== undefined) {
      const version = await this.visibleVersion(actor, view, versionNo);
      if (!version) throw new AppError(ErrorCode.NOT_FOUND, 'Version not found.');
      versionFilter = { versionId: In([version.id]) };
    }

    const comments = await this.comments.find({
      where: { artifactId: view.artifact.id, deletedAt: IsNull(), ...versionFilter },
      relations: { author: true, version: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const threads = new Map<string, CommentThreadView>();
    for (const comment of comments) {
      if (comment.parentId === null) {
        threads.set(comment.id, { ...this.toView(actor, comment, view.target), replies: [] });
      }
    }
    for (const comment of comments) {
      if (comment.parentId !== null) {
        threads.get(comment.parentId)?.replies.push(this.toView(actor, comment, view.target));
      }
    }
    const all = [...threads.values()];
    return include === 'open' ? all.filter((thread) => thread.comment.resolvedAt === null) : all;
  }

  /**
   * Adds a comment on `versionNo` (by default the newest version the actor can see), or a reply
   * to a top-level comment, on that comment's version.
   */
  async create(
    actor: Actor,
    artifactId: string,
    { body, versionNo, parentId }: CreateCommentOptions,
  ): Promise<CommentView> {
    const view = await this.artifacts.getForAction(actor, artifactId, 'comment');
    const parent =
      parentId === undefined ? null : await this.parentToReplyTo(actor, view, parentId);
    if (parent && versionNo !== undefined && versionNo !== parent.version.versionNo) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'versionNo', message: 'A reply is on the same version as its comment.' },
      ]);
    }
    const version = parent?.version ?? (await this.versionToCommentOn(actor, view, versionNo));

    const inserted = await this.comments.insert({
      artifactId: view.artifact.id,
      versionId: version.id,
      parentId: parent?.id ?? null,
      authorId: actor.userId,
      body,
    });
    const id = inserted.identifiers[0]?.id as string;
    this.logger.info(
      {
        userId: actor.userId,
        artifactId: view.artifact.id,
        commentId: id,
        parentId: parent?.id ?? null,
        versionNo: version.versionNo,
        via: actor.via,
      },
      'Comment created',
    );

    const comment = await this.comments.findOneOrFail({
      where: { id },
      relations: { author: true, version: true },
    });
    return this.toView(actor, comment, view.target);
  }

  /** Changes the body, or resolves or reopens a top-level comment. Author only. */
  async update(
    actor: Actor,
    commentId: string,
    changes: UpdateCommentOptions,
  ): Promise<CommentView> {
    const { comment, artifact } = await this.visibleComment(actor, commentId);
    const permissions = this.access.commentPermissions(actor, comment, artifact.target);
    if (changes.resolved !== undefined && comment.parentId !== null) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'resolved', message: 'Only top-level comments can be resolved.' },
      ]);
    }
    if (
      (changes.body !== undefined && !permissions.edit) ||
      (changes.resolved !== undefined && !permissions.resolve)
    ) {
      throw this.forbidden(actor, comment);
    }

    const log = { userId: actor.userId, artifactId: comment.artifactId, commentId: comment.id };
    if (changes.body !== undefined && changes.body !== comment.body) {
      comment.body = changes.body;
      comment.editedAt = new Date();
      this.logger.info(log, 'Comment edited');
    }
    if (changes.resolved !== undefined && changes.resolved !== (comment.resolvedAt !== null)) {
      comment.resolvedAt = changes.resolved ? new Date() : null;
      comment.resolvedBy = changes.resolved ? actor.userId : null;
      this.logger.info(log, changes.resolved ? 'Comment resolved' : 'Comment reopened');
    }
    await this.comments.update(
      { id: comment.id, deletedAt: IsNull() },
      {
        body: comment.body,
        editedAt: comment.editedAt,
        resolvedAt: comment.resolvedAt,
        resolvedBy: comment.resolvedBy,
      },
    );
    return this.toView(actor, comment, artifact.target);
  }

  /** Soft delete; a deleted top-level comment takes its replies with it. Author only. */
  async remove(actor: Actor, commentId: string): Promise<void> {
    const { comment, artifact } = await this.visibleComment(actor, commentId);
    if (!this.access.commentPermissions(actor, comment, artifact.target).delete) {
      throw this.forbidden(actor, comment);
    }
    await this.comments.update({ id: comment.id, deletedAt: IsNull() }, { deletedAt: new Date() });
    this.logger.info(
      { userId: actor.userId, artifactId: comment.artifactId, commentId: comment.id },
      'Comment deleted',
    );
  }

  /**
   * The comment, if the actor can see it: it isn't deleted (nor is its parent), and is on a
   * version of an artifact they can view. `NOT_FOUND` otherwise, without saying which.
   */
  private async visibleComment(actor: Actor, commentId: string): Promise<VisibleComment> {
    const comment = idSchema.safeParse(commentId).success
      ? await this.comments.findOne({
          where: { id: commentId, deletedAt: IsNull() },
          relations: { author: true, version: true },
        })
      : null;
    if (!comment) throw new AppError(ErrorCode.NOT_FOUND, COMMENT_NOT_FOUND_MESSAGE);

    let artifact: ArtifactView;
    try {
      artifact = await this.artifacts.get(actor, comment.artifactId);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.NOT_FOUND) {
        throw new AppError(ErrorCode.NOT_FOUND, COMMENT_NOT_FOUND_MESSAGE);
      }
      throw error;
    }
    const parentGone =
      comment.parentId !== null &&
      !(await this.comments.existsBy({ id: comment.parentId, deletedAt: IsNull() }));
    if (!this.canSeeVersion(actor, artifact, comment.versionId) || parentGone) {
      throw new AppError(ErrorCode.NOT_FOUND, COMMENT_NOT_FOUND_MESSAGE);
    }
    return { comment, artifact };
  }

  /** The top-level comment to reply to, if the actor can see it. */
  private async parentToReplyTo(
    actor: Actor,
    view: ArtifactView,
    parentId: string,
  ): Promise<Comment> {
    const parent = await this.comments.findOne({
      where: { id: parentId, artifactId: view.artifact.id, deletedAt: IsNull() },
      relations: { version: true },
    });
    if (!parent || !this.canSeeVersion(actor, view, parent.versionId)) {
      throw new AppError(ErrorCode.NOT_FOUND, "The comment you're replying to doesn't exist.");
    }
    if (parent.parentId !== null) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        { path: 'parentId', message: 'Reply to the top-level comment: replies have no replies.' },
      ]);
    }
    return parent;
  }

  /** Version `versionNo`, or the newest one the actor can see; must be one they can see. */
  private async versionToCommentOn(
    actor: Actor,
    view: ArtifactView,
    versionNo: number | undefined,
  ): Promise<ArtifactVersion> {
    const version =
      versionNo === undefined
        ? view.currentVersion
        : await this.visibleVersion(actor, view, versionNo);
    if (!version) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'The request is invalid.', [
        {
          path: 'versionNo',
          message:
            versionNo === undefined
              ? 'There is no version to comment on yet.'
              : `There is no version ${versionNo}.`,
        },
      ]);
    }
    return version;
  }

  /** Version `versionNo` of the artifact, or null if it doesn't exist or the viewer can't see it. */
  private async visibleVersion(
    actor: Actor,
    view: ArtifactView,
    versionNo: number,
  ): Promise<ArtifactVersion | null> {
    const version = await this.versions.findOneBy({ artifactId: view.artifact.id, versionNo });
    return version && this.canSeeVersion(actor, view, version.id) ? version : null;
  }

  private canSeeVersion(actor: Actor, view: ArtifactView, versionId: string): boolean {
    const visible = this.access.visibleVersionIds(actor, view.target);
    return !visible || visible.has(versionId);
  }

  private toView(actor: Actor, comment: Comment, target: AccessTarget): CommentView {
    return { comment, permissions: this.access.commentPermissions(actor, comment, target) };
  }

  private forbidden(actor: Actor, comment: Comment): AppError {
    return new AppError(
      ErrorCode.FORBIDDEN,
      comment.authorId === actor.userId
        ? "You can't comment on this artifact anymore."
        : 'Only its author can change this comment.',
    );
  }
}
