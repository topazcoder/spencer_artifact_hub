import { describe, expect, it } from 'vitest';
import {
  createArtifactRequestSchema,
  createVersionRequestSchema,
  updateArtifactRequestSchema,
} from './artifacts.js';

describe('createArtifactRequestSchema', () => {
  it('applies defaults and trims the title', () => {
    expect(createArtifactRequestSchema.parse({ title: '  Pricing page  ' })).toEqual({
      title: 'Pricing page',
      description: '',
      tags: [],
      visibility: 'private',
    });
  });

  it('normalizes and de-duplicates tags', () => {
    const { tags } = createArtifactRequestSchema.parse({
      title: 'x',
      tags: [' Landing  Page ', 'landing page', 'Q3'],
    });
    expect(tags).toEqual(['landing page', 'q3']);
  });

  it.each([
    [{ title: '   ' }, 'title'],
    [{ title: 'x'.repeat(121) }, 'title'],
    [{ title: 'x', tags: ['a,b'] }, 'tags.0'],
    [{ title: 'x', tags: [' '] }, 'tags.0'],
    [{ title: 'x', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 'tags'],
    [{ title: 'x', visibility: 'secret' }, 'visibility'],
  ])('rejects %j at %s', (input, path) => {
    const result = createArtifactRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});

describe('updateArtifactRequestSchema', () => {
  it('keeps only the fields sent, normalized', () => {
    expect(updateArtifactRequestSchema.parse({ title: ' New ', tags: ['A', 'a'] })).toEqual({
      title: 'New',
      tags: ['a'],
    });
  });

  it('allows clearing the description and tags', () => {
    expect(updateArtifactRequestSchema.parse({ description: '  ', tags: [] })).toEqual({
      description: '',
      tags: [],
    });
  });

  it.each([
    [{}, ''],
    [{ title: '' }, 'title'],
    [{ visibility: 'secret' }, 'visibility'],
    [{ ownerId: 'x' }, ''],
  ])('rejects %j at "%s"', (input, path) => {
    const result = updateArtifactRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});

describe('createVersionRequestSchema', () => {
  it('trims the change note and defaults it to blank', () => {
    expect(createVersionRequestSchema.parse({ changeNote: ' Fixed typos ' })).toEqual({
      changeNote: 'Fixed typos',
    });
    expect(createVersionRequestSchema.parse({})).toEqual({ changeNote: '' });
  });

  it('limits the change note', () => {
    expect(createVersionRequestSchema.safeParse({ changeNote: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});
