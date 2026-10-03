import { describe, expect, it } from 'vitest';
import {
  COMMENT_BODY_MAX_LENGTH,
  commentListQuerySchema,
  createCommentRequestSchema,
  updateCommentRequestSchema,
} from './comments.js';

describe('createCommentRequestSchema', () => {
  it('trims the body; version and parent are optional', () => {
    expect(createCommentRequestSchema.parse({ body: '  Looks good \n' })).toEqual({
      body: 'Looks good',
    });
  });

  it.each([
    [{ body: '   ' }, 'body'],
    [{ body: 'x'.repeat(COMMENT_BODY_MAX_LENGTH + 1) }, 'body'],
    [{ body: 'Hi', versionNo: 0 }, 'versionNo'],
    [{ body: 'Hi', parentId: 'not-an-id' }, 'parentId'],
  ])('rejects %j at %s', (input, path) => {
    const result = createCommentRequestSchema.safeParse(input);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});

describe('updateCommentRequestSchema', () => {
  it('accepts a body, resolved, or both, and nothing else', () => {
    expect(updateCommentRequestSchema.parse({ resolved: false })).toEqual({ resolved: false });
    expect(updateCommentRequestSchema.parse({ body: ' New ', resolved: true })).toEqual({
      body: 'New',
      resolved: true,
    });
    expect(updateCommentRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCommentRequestSchema.safeParse({ versionNo: 2 }).success).toBe(false);
  });
});

describe('commentListQuerySchema', () => {
  it('defaults to every version and resolved threads too; blanks count as absent', () => {
    expect(commentListQuerySchema.parse({})).toEqual({ include: 'all' });
    expect(commentListQuerySchema.parse({ version: '', include: '' })).toEqual({ include: 'all' });
    expect(commentListQuerySchema.parse({ version: '2', include: 'open' })).toEqual({
      version: 2,
      include: 'open',
    });
    expect(commentListQuerySchema.safeParse({ version: 'latest' }).success).toBe(false);
  });
});
