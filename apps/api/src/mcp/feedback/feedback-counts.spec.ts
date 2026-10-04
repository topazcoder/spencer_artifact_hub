import type { CommentThreadView } from '../../comments/comments.types.js';
import { countFeedback } from './feedback-counts.js';

function thread(versionNo: number, resolved: boolean): CommentThreadView {
  return {
    comment: { version: { versionNo }, resolvedAt: resolved ? new Date() : null },
    replies: [],
  } as unknown as CommentThreadView;
}

describe('countFeedback', () => {
  it('counts open and resolved threads, overall and per version, newest first', () => {
    expect(
      countFeedback([thread(1, true), thread(2, false), thread(1, false), thread(2, false)]),
    ).toEqual({
      open: 3,
      resolved: 1,
      byVersion: [
        { versionNo: 2, open: 2, resolved: 0 },
        { versionNo: 1, open: 1, resolved: 1 },
      ],
    });
  });

  it('counts nothing without threads', () => {
    expect(countFeedback([])).toEqual({ open: 0, resolved: 0, byVersion: [] });
  });
});
