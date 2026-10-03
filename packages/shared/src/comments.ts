import { z } from 'zod';
import { blankAsUndefined } from './artifacts.js';

export const COMMENT_BODY_MAX_LENGTH = 5000;

const commentBodySchema = z
  .string()
  .trim()
  .min(1, 'Write a comment.')
  .max(COMMENT_BODY_MAX_LENGTH, `Keep comments to ${COMMENT_BODY_MAX_LENGTH} characters.`);

/**
 * Body of `POST /api/artifacts/:id/comments`. A comment is on one version: `versionNo`, or the
 * newest one the caller can see. A reply (`parentId`) is on its comment's version.
 */
export const createCommentRequestSchema = z.object({
  body: commentBodySchema,
  versionNo: z.number().int().positive().optional(),
  /** The top-level comment to reply to. Replies are one level deep. */
  parentId: z.guid().optional(),
});

export type CreateCommentRequest = z.input<typeof createCommentRequestSchema>;
export type CreateCommentOptions = z.output<typeof createCommentRequestSchema>;

/** Body of `PATCH /api/comments/:id`: a new body, resolving or reopening it, or both. */
export const updateCommentRequestSchema = z
  .strictObject({ body: commentBodySchema, resolved: z.boolean() })
  .partial()
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'Send at least one field to change.',
  });

export type UpdateCommentRequest = z.input<typeof updateCommentRequestSchema>;
export type UpdateCommentOptions = z.output<typeof updateCommentRequestSchema>;

/** `open`: only threads that aren't resolved. `all`: resolved ones too. */
export const COMMENT_INCLUDE_OPTIONS = ['open', 'all'] as const;
export type CommentInclude = (typeof COMMENT_INCLUDE_OPTIONS)[number];

/** Query of `GET /api/artifacts/:id/comments`. */
export const commentListQuerySchema = z.object({
  /** Only comments on this version; absent = every version the caller can see. */
  version: z.preprocess(blankAsUndefined, z.coerce.number().int().positive().optional()),
  include: z.preprocess(blankAsUndefined, z.enum(COMMENT_INCLUDE_OPTIONS).default('all')),
});

export type CommentListQuery = z.output<typeof commentListQuerySchema>;

export const commentSchema = z.object({
  id: z.uuid(),
  /** The version it is on. */
  versionNo: z.number().int().positive(),
  /** The comment it replies to; null for a top-level comment. */
  parentId: z.uuid().nullable(),
  author: z.object({ id: z.uuid(), displayName: z.string() }),
  /** Plain text written by a user; never render it as HTML. */
  body: z.string(),
  /** When its author resolved it; null while open. Replies are never resolved. */
  resolvedAt: z.iso.datetime().nullable(),
  editedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** What the requesting user may do with it; the server enforces it either way. */
  permissions: z.object({ edit: z.boolean(), delete: z.boolean(), resolve: z.boolean() }),
});

export type Comment = z.infer<typeof commentSchema>;
export type CommentPermissions = Comment['permissions'];

/** A top-level comment and its replies, oldest first. */
export const commentThreadSchema = commentSchema.extend({ replies: z.array(commentSchema) });

export type CommentThread = z.infer<typeof commentThreadSchema>;

/**
 * Response of `GET /api/artifacts/:id/comments`: threads oldest first. Deleted comments are left
 * out, and so are the replies of a deleted comment.
 */
export const commentListResponseSchema = z.object({ items: z.array(commentThreadSchema) });

export type CommentListResponse = z.infer<typeof commentListResponseSchema>;

/** Response of `POST /api/artifacts/:id/comments` and `PATCH /api/comments/:id`. */
export const commentResponseSchema = z.object({ comment: commentSchema });

export type CommentResponse = z.infer<typeof commentResponseSchema>;
