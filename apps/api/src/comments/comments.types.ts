import type { CommentInclude, CommentPermissions } from '@artifact-hub/shared';
import type { ArtifactView } from '../artifacts/artifacts.types.js';
import type { Comment } from './comment.entity.js';

/** A comment as one user sees it. */
export interface CommentView {
  comment: Comment;
  permissions: CommentPermissions;
}

/** A comment just posted, or the same one found posted recently (`deduplicated`). */
export interface CreatedComment extends CommentView {
  deduplicated: boolean;
}

export interface CreateCommentBehaviour {
  /** Return the actor's same comment posted this recently, rather than posting it again. */
  dedupeWithinMs?: number;
}

/** A top-level comment and its replies, oldest first. */
export interface CommentThreadView extends CommentView {
  replies: CommentView[];
}

export interface CommentListOptions {
  /** Only comments on this version; undefined = every version the user can see. */
  versionNo?: number;
  include: CommentInclude;
}

/** A comment and the artifact it is on, as the user sees it. */
export interface VisibleComment {
  comment: Comment;
  artifact: ArtifactView;
}
