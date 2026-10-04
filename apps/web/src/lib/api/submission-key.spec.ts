import { describe, expect, it } from 'vitest';
import { submissionKey } from './submission-key.ts';

describe('submissionKey', () => {
  it('is a UUID, the same for the same variables', () => {
    const variables = { body: 'Hi' };
    const key = submissionKey(variables);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(submissionKey(variables)).toBe(key);
  });

  it('is new for other variables, even if equal', () => {
    expect(submissionKey({ body: 'Hi' })).not.toBe(submissionKey({ body: 'Hi' }));
  });
});
