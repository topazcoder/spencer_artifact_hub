import { FEEDBACK_SENTIMENTS, FEEDBACK_THEME_STATUSES } from '@artifact-hub/shared';
import { z } from 'zod';
import { UNTRUSTED_CONTENT_RULE, untrustedBlock } from '../../ai/untrusted-content.js';
import type { CommentThreadView, CommentView } from '../comments.types.js';
import type {
  FeedbackSummaryAnswer,
  FeedbackSummaryContent,
  SummaryInput,
} from './feedback-summaries.types.js';

/** Characters of comments sent at most; older threads come first, later ones are left out. */
export const SUMMARY_INPUT_MAX_CHARS = 60_000;
/** Longer comments are cut, so one long comment can't crowd out the rest. */
const COMMENT_MAX_CHARS = 2_000;

const OVERVIEW_MAX_LENGTH = 1_500;
const TITLE_MAX_LENGTH = 100;
const SUMMARY_MAX_LENGTH = 600;
const THEMES_MAX = 8;
const DISAGREEMENTS_MAX = 5;

const refsSchema = z
  .array(z.string())
  .describe('Refs of the comments it comes from, e.g. ["c1", "c4"].');

/**
 * What the model answers. Loose on purpose (no lengths): structured output keeps the shape,
 * and `toSummaryContent` trims what is too long.
 */
export const feedbackSummaryAnswerSchema = z.object({
  overview: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      sentiment: z.enum(FEEDBACK_SENTIMENTS),
      status: z.enum(FEEDBACK_THEME_STATUSES),
      comments: refsSchema,
    }),
  ),
  disagreements: z.array(
    z.object({ topic: z.string(), summary: z.string(), comments: refsSchema }),
  ),
});

export const FEEDBACK_SUMMARY_SYSTEM_PROMPT = `You summarize reviewers' comments on an artifact in Artifact Hub (a web page, image, PDF or document a team published for review), for the people working on it.

- overview: 2 to 4 sentences on how the feedback is overall, and what is still open.
- themes: group the comments by what reviewers asked for, liked or worried about, merging comments that make the same point. At most ${THEMES_MAX}, the most important first. Each has a title of a few words, a summary of 1 to 3 sentences, its sentiment, and its status from its threads: "open" if none is resolved, "resolved" if all are, "mixed" otherwise. Replies belong to their thread.
- disagreements: points where reviewers want different or opposite things. Empty when there are none; never invent one.
- comments: the refs (c1, c2, …) of the comments each theme or disagreement comes from. Never put refs in the text.

Use only what the comments say. Write plain text, without Markdown.

${UNTRUSTED_CONTENT_RULE}`;

/**
 * The threads as the model reads them, each comment labelled with a short ref (cheaper than
 * ids, and mapped back by `toSummaryContent`). Threads are added oldest first while they fit
 * `SUMMARY_INPUT_MAX_CHARS`.
 */
export function summaryInput(
  threads: readonly CommentThreadView[],
  { showVersions }: { showVersions: boolean },
): SummaryInput {
  const refs = new Map<string, string>();
  const blocks: string[] = [];
  let length = 0;
  let commentCount = 0;
  let clipped = false;
  const label = ({ comment }: CommentView, heading: string) => {
    const ref = `c${refs.size + 1}`;
    refs.set(ref, comment.id);
    return `[${ref}] ${heading}:\n${clip(comment.body, COMMENT_MAX_CHARS)}`;
  };

  for (const thread of threads) {
    const { comment } = thread;
    const status = comment.resolvedAt ? 'resolved' : 'open';
    const version = showVersions ? `, on v${comment.version.versionNo}` : '';
    const refsBefore = refs.size;
    const block = [
      label(thread, `${comment.author.displayName}${version}, ${status}`),
      ...thread.replies.map((reply) =>
        indent(label(reply, `Reply by ${reply.comment.author.displayName}`)),
      ),
    ].join('\n');
    if (length + block.length > SUMMARY_INPUT_MAX_CHARS) {
      if (blocks.length === 0) {
        // A first thread too long on its own is cut rather than left out.
        blocks.push(clip(block, SUMMARY_INPUT_MAX_CHARS));
        commentCount += 1 + thread.replies.length;
        clipped = true;
      } else {
        // Forget the refs of a thread that doesn't fit.
        for (const ref of [...refs.keys()].slice(refsBefore)) refs.delete(ref);
      }
      break;
    }
    blocks.push(block);
    length += block.length;
    commentCount += 1 + thread.replies.length;
  }
  return {
    text: blocks.join('\n\n'),
    refs,
    commentCount,
    partial: clipped || blocks.length < threads.length,
  };
}

/** The task's input: the artifact, then its comments. */
export function summaryPrompt(
  title: string,
  input: SummaryInput,
  { versionNo }: { versionNo: number | undefined },
): string {
  const scope = versionNo === undefined ? 'on every version' : `on version ${versionNo}`;
  const partial = input.partial ? ' (too many to send them all: the oldest ones)' : '';
  return [
    `The artifact's title:\n${untrustedBlock('title', title)}`,
    `The comments ${scope}, oldest first: ${input.commentCount} comments and replies${partial}.\n${untrustedBlock('comments', input.text)}`,
  ].join('\n\n');
}

/** The summary to save: text trimmed to its limits, refs turned back into comment ids. */
export function toSummaryContent(
  answer: FeedbackSummaryAnswer,
  refs: ReadonlyMap<string, string>,
): FeedbackSummaryContent {
  const ids = (list: string[]) => [
    ...new Set(list.flatMap((ref) => refs.get(ref.trim().replace(/^\[|\]$/g, '')) ?? [])),
  ];
  return {
    overview: clip(answer.overview.trim(), OVERVIEW_MAX_LENGTH),
    themes: answer.themes.slice(0, THEMES_MAX).map((theme) => ({
      title: clip(theme.title.trim(), TITLE_MAX_LENGTH),
      summary: clip(theme.summary.trim(), SUMMARY_MAX_LENGTH),
      sentiment: theme.sentiment,
      status: theme.status,
      commentIds: ids(theme.comments),
    })),
    disagreements: answer.disagreements.slice(0, DISAGREEMENTS_MAX).map((item) => ({
      topic: clip(item.topic.trim(), TITLE_MAX_LENGTH),
      summary: clip(item.summary.trim(), SUMMARY_MAX_LENGTH),
      commentIds: ids(item.comments),
    })),
  };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function indent(text: string): string {
  return text.replace(/^/gm, '  ');
}
