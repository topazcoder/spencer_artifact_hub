import type { CommentThread as CommentThreadData } from '@artifact-hub/shared';
import { ChevronDownIcon, ChevronRightIcon, ReplyIcon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils';
import { CommentForm } from './comment-form.tsx';
import { CommentItem } from './comment-item.tsx';
import { useCreateComment } from './use-comments.ts';

/**
 * A top-level comment with its replies, folded away until asked for, and a reply box for those
 * who may comment. Starting a reply unfolds them, so the reply is written in context.
 */
export function CommentThread({
  artifactId,
  thread,
  canReply,
  badges,
}: {
  artifactId: string;
  thread: CommentThreadData;
  canReply: boolean;
  /** Shown next to the top-level comment's time, e.g. its version. */
  badges?: ReactNode;
}) {
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const repliesId = useId();
  const create = useCreateComment(artifactId);
  const resolved = thread.resolvedAt !== null;
  const replyCount = thread.replies.length;
  const Chevron = showReplies ? ChevronDownIcon : ChevronRightIcon;

  return (
    <li className={cn('grid gap-3 rounded-lg border p-3', resolved && 'bg-muted/50')}>
      <CommentItem
        artifactId={artifactId}
        comment={thread}
        replyCount={replyCount}
        badges={badges}
      />
      {replyCount > 0 || (canReply && !replying) ? (
        <div className="flex flex-wrap gap-1">
          {replyCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              aria-expanded={showReplies}
              aria-controls={repliesId}
              onClick={() => setShowReplies((shown) => !shown)}
            >
              <Chevron aria-hidden="true" />
              {replyCount === 1 ? '1 reply' : `${replyCount} replies`}
            </Button>
          ) : null}
          {canReply && !replying ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                setReplying(true);
                setShowReplies(true);
              }}
            >
              <ReplyIcon aria-hidden="true" />
              Reply
            </Button>
          ) : null}
        </div>
      ) : null}
      {showReplies && replyCount > 0 ? (
        <ol id={repliesId} className="grid gap-3 border-l-2 pl-3" aria-label="Replies">
          {thread.replies.map((reply) => (
            <li key={reply.id}>
              <CommentItem artifactId={artifactId} comment={reply} />
            </li>
          ))}
        </ol>
      ) : null}
      {replying ? (
        <CommentForm
          label="Reply"
          placeholder="Reply…"
          submitLabel="Reply"
          autoFocus
          onSubmit={async (body) => {
            await create.mutateAsync({ body, parentId: thread.id });
            setReplying(false);
          }}
          onCancel={() => setReplying(false)}
        />
      ) : null}
    </li>
  );
}
