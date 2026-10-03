import type {
  Comment as CommentDto,
  CommentThread as CommentThreadDto,
} from '@artifact-hub/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { User } from '../users/user.entity.js';
import type { CommentThreadView, CommentView } from './comments.types.js';

/** A comment on one version of an artifact, or a reply to one (one level deep). */
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  artifactId: string;

  @Column('uuid')
  versionId: string;

  @ManyToOne(() => ArtifactVersion, { onDelete: 'CASCADE' })
  @JoinColumn()
  version: ArtifactVersion;

  /** The top-level comment this replies to; null for a top-level comment. */
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @Column('uuid')
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  author: User;

  /** Plain text, at most `COMMENT_BODY_MAX_LENGTH` characters. */
  @Column('text')
  body: string;

  /** Reserved for positional annotations (a region or page); always null for now. */
  @Column({ type: 'jsonb', nullable: true })
  anchor: unknown;

  /** Top-level comments only. */
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  /** User id of who resolved it: always its author, for now. */
  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  /** Soft delete: the comment, and the replies of a deleted top-level comment, are hidden. */
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/** Requires `author` and `version` to be loaded. */
export function toCommentDto({ comment, permissions }: CommentView): CommentDto {
  return {
    id: comment.id,
    versionNo: comment.version.versionNo,
    parentId: comment.parentId,
    author: { id: comment.author.id, displayName: comment.author.displayName },
    body: comment.body,
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    editedAt: comment.editedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    permissions,
  };
}

export function toCommentThreadDto(thread: CommentThreadView): CommentThreadDto {
  return { ...toCommentDto(thread), replies: thread.replies.map(toCommentDto) };
}
