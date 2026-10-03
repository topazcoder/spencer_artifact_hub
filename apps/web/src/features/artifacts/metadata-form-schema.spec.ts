import { describe, expect, it } from 'vitest';
import { metadataFormSchema } from './metadata-form-schema.ts';

describe('metadataFormSchema', () => {
  it('splits, normalizes and de-duplicates comma-separated tags', () => {
    const result = metadataFormSchema.parse({
      title: ' Pricing ',
      description: '',
      tags: 'Marketing, q3,, marketing ',
    });
    expect(result).toEqual({
      title: 'Pricing',
      description: '',
      tags: ['marketing', 'q3'],
    });
  });

  it('reports tag problems on the tags field itself', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`).join(',');
    const result = metadataFormSchema.safeParse({ title: 'x', description: '', tags });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['tags'], message: 'Use at most 10 tags.' }),
    ]);
  });

  it('requires a title', () => {
    const result = metadataFormSchema.safeParse({ title: '  ', description: '', tags: '' });
    expect(result.error?.issues[0]).toMatchObject({ path: ['title'], message: 'Enter a title.' });
  });
});
