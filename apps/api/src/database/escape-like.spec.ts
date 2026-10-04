import { escapeLike } from './escape-like.js';

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('100%_off\\now')).toBe('100\\%\\_off\\\\now');
  });

  it('leaves other text alone', () => {
    expect(escapeLike('Ada Lovelace')).toBe('Ada Lovelace');
  });
});
