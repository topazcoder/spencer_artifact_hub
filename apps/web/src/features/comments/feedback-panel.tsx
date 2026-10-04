import type { Artifact, CommentThread as CommentThreadData } from '@artifact-hub/shared';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { InlineError, InlineLoading } from '@/components/inline-status.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { cn } from '@/lib/utils';
import { CommentForm } from './comment-form.tsx';
import { CommentThread } from './comment-thread.tsx';
import type { FeedbackFilter } from './comments.types.ts';
import { FeedbackSummaryDialog } from './feedback-summary-dialog.tsx';
import { useCommentThreads, useCreateComment } from './use-comments.ts';

/**
 * The Feedback tab: a box to add a comment for those who may comment, then a button for the AI
 * summary (with AI on) and the comments on the version being viewed (`versionNo`) or on every version,
 * resolved or not, oldest first.
 * `versionNo` is null when no version is shown; all comments are listed then.
 */
export function FeedbackPanel({
  artifact,
  versionNo,
}: {
  artifact: Artifact;
  versionNo: number | null;
}) {
  const [filter, setFilter] = useState<FeedbackFilter>('version');
  const shownVersionNo = filter === 'version' ? versionNo : null;
  const {
    data: threads,
    error,
    refetch,
    isPlaceholderData,
  } = useCommentThreads(artifact.id, shownVersionNo);
  const create = useCreateComment(artifact.id);
  const canComment = artifact.permissions.comment;
  const filterLabelId = useId();

  return (
    <div className="grid gap-4">
      {canComment && versionNo !== null ? (
        <CommentForm
          label="Add a comment"
          placeholder={`Comment on v${versionNo}…`}
          submitLabel="Comment"
          onSubmit={(body) => create.mutateAsync({ body, versionNo })}
        />
      ) : !canComment ? (
        <p className="text-sm text-muted-foreground">You can read the comments, but not add any.</p>
      ) : null}

      {versionNo !== null ? (
        <div className="grid gap-1.5">
          <span id={filterLabelId} className="text-xs font-medium text-muted-foreground">
            Show feedback for:
          </span>
          <div
            role="group"
            aria-labelledby={filterLabelId}
            className="flex rounded-md border p-0.5"
          >
            {(['version', 'all'] as const).map((option) => (
              <Button
                key={option}
                variant={filter === option ? 'secondary' : 'ghost'}
                size="xs"
                className="flex-1"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {option === 'version' ? `This version (v${versionNo})` : 'All versions'}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <FeedbackSummaryDialog
        artifactId={artifact.id}
        versionNo={shownVersionNo}
        hasComments={(threads?.length ?? 0) > 0}
      />

      {error && !threads ? (
        <InlineError error={error} onRetry={() => void refetch()} />
      ) : !threads ? (
        <div className="h-24">
          <InlineLoading />
        </div>
      ) : (
        <ThreadList
          artifact={artifact}
          threads={threads}
          showVersions={shownVersionNo === null}
          emptyText={
            shownVersionNo === null ? 'No comments yet.' : `No comments on v${shownVersionNo} yet.`
          }
          className={cn('transition-opacity', isPlaceholderData && 'opacity-60')}
        />
      )}
    </div>
  );
}

function ThreadList({
  artifact,
  threads,
  showVersions,
  emptyText,
  className,
}: {
  artifact: Artifact;
  threads: CommentThreadData[];
  /** Label each thread with its version, linking to it. */
  showVersions: boolean;
  emptyText: string;
  className?: string;
}) {
  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  const currentVersionNo = artifact.currentVersion?.versionNo;
  return (
    <ol className={cn('grid gap-3', className)} aria-label="Comments">
      {threads.map((thread) => (
        <CommentThread
          key={thread.id}
          artifactId={artifact.id}
          thread={thread}
          canReply={artifact.permissions.comment}
          badges={
            showVersions ? (
              <Badge asChild variant="outline">
                <Link
                  to={
                    thread.versionNo === currentVersionNo
                      ? `/artifacts/${artifact.id}`
                      : `/artifacts/${artifact.id}?v=${thread.versionNo}`
                  }
                  aria-label={`On version ${thread.versionNo}`}
                >
                  v{thread.versionNo}
                </Link>
              </Badge>
            ) : null
          }
        />
      ))}
    </ol>
  );
}
