import type {
  FeedbackSentiment,
  FeedbackSummary as Summary,
  FeedbackThemeStatus,
} from '@artifact-hub/shared';
import { Loader2Icon, RefreshCwIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx';
import { useAppConfig } from '@/features/config/use-app-config.ts';
import { describeError, isApiError } from '@/lib/api/api-error.ts';
import { formatRelativeTime } from '@/lib/format.ts';
import { useFeedbackSummary, useSummarizeFeedback } from './use-comments.ts';

const STATUS_LABELS: Record<FeedbackThemeStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
  mixed: 'Partly resolved',
};

const SENTIMENT_LABELS: Record<FeedbackSentiment, string> = {
  positive: 'Positive',
  negative: 'Concerns',
  mixed: 'Mixed',
  neutral: 'Neutral',
};

/**
 * A button opening the AI summary of the comments shown: one version's (`versionNo`) or every
 * version's (null). Opening it shows the saved summary, or writes one if there is none yet; once
 * comments change it is marked outdated, with a button to write it again. Hidden without AI, and
 * while there are no comments.
 */
export function FeedbackSummaryDialog({
  artifactId,
  versionNo,
  hasComments,
}: {
  artifactId: string;
  versionNo: number | null;
  hasComments: boolean;
}) {
  const { data: config } = useAppConfig();
  const [open, setOpen] = useState(false);
  const { data } = useFeedbackSummary(artifactId, versionNo, { enabled: open });
  const summarize = useSummarizeFeedback(artifactId, versionNo);
  /** Whether this opening already asked for a summary, so a failure isn't retried on its own. */
  const asked = useRef(false);

  // Opening it is asking for a summary: write one if none is saved.
  useEffect(() => {
    if (!open || !data || data.summary || asked.current) return;
    asked.current = true;
    summarize.mutate();
  }, [open, data, summarize]);

  if (!(config?.features.ai ?? false) || !hasComments) return null;

  const onOpenChange = (next: boolean) => {
    if (next) {
      asked.current = false;
      summarize.reset();
    }
    setOpen(next);
  };

  const summary = data?.summary ?? null;
  const busy = summarize.isPending;
  const failure = summarize.error
    ? isApiError(summarize.error, 'AI_UNAVAILABLE')
      ? summarize.error.message
      : describeError(summarize.error)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="justify-self-start">
          <SparklesIcon aria-hidden="true" />
          Summarize feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Feedback summary</DialogTitle>
          <DialogDescription>
            {versionNo === null
              ? 'The comments on every version you can see.'
              : `The comments on version ${versionNo}.`}
          </DialogDescription>
        </DialogHeader>

        {failure ? (
          <div className="grid gap-2">
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
            {!summary ? (
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => summarize.mutate()}
              >
                Try again
              </Button>
            ) : null}
          </div>
        ) : null}

        {summary ? (
          <>
            {data?.outdated ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <Badge variant="outline">Outdated</Badge>
                <span className="text-muted-foreground">Comments changed since.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => summarize.mutate()}
                >
                  {busy ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCwIcon aria-hidden="true" />
                  )}
                  {busy ? 'Summarizing…' : 'Refresh'}
                </Button>
              </div>
            ) : null}
            <SummaryBody summary={summary} />
          </>
        ) : !failure ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            {busy ? 'Reading the comments… this can take up to a minute.' : 'Loading…'}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryBody({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-3 text-sm">
      <p>{summary.overview}</p>

      {summary.themes.length > 0 ? (
        <ul aria-label="Themes" className="grid gap-2">
          {summary.themes.map((theme, index) => (
            <li key={index} className="grid gap-1 rounded-md border bg-background p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{theme.title}</span>
                <Badge variant={theme.status === 'resolved' ? 'secondary' : 'outline'}>
                  {STATUS_LABELS[theme.status]}
                </Badge>
                <Badge variant="outline">{SENTIMENT_LABELS[theme.sentiment]}</Badge>
              </div>
              <p className="text-muted-foreground">{theme.summary}</p>
              {theme.commentIds.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  From {theme.commentIds.length}{' '}
                  {theme.commentIds.length === 1 ? 'comment' : 'comments'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {summary.disagreements.length > 0 ? (
        <div className="grid gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">Where reviewers disagree</h4>
          <ul aria-label="Disagreements" className="grid gap-1.5">
            {summary.disagreements.map((item, index) => (
              <li key={index}>
                <span className="font-medium">{item.topic}:</span>{' '}
                <span className="text-muted-foreground">{item.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Written by AI {formatRelativeTime(summary.generatedAt)} from {summary.commentCount}{' '}
        {summary.commentCount === 1 ? 'comment' : 'comments'}
        {summary.partial ? ' (the oldest ones; there were too many to read them all)' : ''}. Check
        the comments for details.
      </p>
    </div>
  );
}
