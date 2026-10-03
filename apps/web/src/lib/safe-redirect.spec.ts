import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-redirect.ts';

describe('safeNextPath', () => {
  it.each(['/', '/artifacts/1', '/artifacts?scope=mine#top'])(
    'keeps the in-app path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    '',
    'artifacts',
    '//evil.test',
    '/\\evil.test',
    'https://evil.test/x',
    'javascript:alert(1)',
  ])('rejects %s', (next) => {
    expect(safeNextPath(next)).toBeNull();
  });
});
