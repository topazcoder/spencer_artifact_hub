import type { Comment } from '@artifact-hub/shared';
import { CheckIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { formatRelativeTime } from '@/lib/format.ts';
import { toastError } from '@/lib/toast-error.ts';
import { CommentBody } from './comment-body.tsx';
import { CommentForm } from './comment-form.tsx';
import { DeleteCommentDialog } from './delete-comment-dialog.tsx';
import { useDeleteComment, useUpdateComment } from './use-comments.ts';

/**
 * One comment: author, time, body, and the actions its author has (edit, delete, and resolve
 * or reopen for a top-level comment). `badges` go after the time, e.g. its version.
 */
export function CommentItem({
  artifactId,
  comment,
  replyCount = 0,
  badges,
}: {
  artifactId: string;
  comment: Comment;
  replyCount?: number;
  badges?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateComment(artifactId);
  const remove = useDeleteComment(artifactId);
  const { permissions } = comment;
  const resolved = comment.resolvedAt !== null;
  const busy = update.isPending || remove.isPending;

  return (
    <article aria-label={`Comment by ${comment.author.displayName}`} className="grid gap-1.5">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-medium text-foreground">{comment.author.displayName}</span>
        <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()}>
          {formatRelativeTime(comment.createdAt)}
        </time>
        {comment.editedAt ? (
          <span title={`Edited ${new Date(comment.editedAt).toLocaleString()}`}>(edited)</span>
        ) : null}
        {badges}
        {resolved ? (
          <Badge variant="secondary">
            <CheckIcon aria-hidden="true" />
            Resolved
          </Badge>
        ) : null}
        <span className="ml-auto flex gap-0.5">
          {permissions.resolve ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={resolved ? 'Reopen' : 'Resolve'}
              title={resolved ? 'Reopen' : 'Resolve'}
              disabled={busy}
              onClick={() =>
                update.mutate(
                  { commentId: comment.id, resolved: !resolved },
                  { onError: toastError },
                )
              }
            >
              {resolved ? <RotateCcwIcon aria-hidden="true" /> : <CheckIcon aria-hidden="true" />}
            </Button>
          ) : null}
          {permissions.edit && !editing ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Edit"
              title="Edit"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <PencilIcon aria-hidden="true" />
            </Button>
          ) : null}
          {permissions.delete ? (
            <DeleteCommentDialog
              replyCount={replyCount}
              onConfirm={() => remove.mutate(comment.id, { onError: toastError })}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Delete"
                title="Delete"
                disabled={busy}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </DeleteCommentDialog>
          ) : null}
        </span>
      </header>
      {editing ? (
        <CommentForm
          label="Edit comment"
          submitLabel="Save"
          defaultBody={comment.body}
          autoFocus
          onSubmit={async (body) => {
            await update.mutateAsync({ commentId: comment.id, body });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <CommentBody text={comment.body} />
      )}
    </article>
  );
}
