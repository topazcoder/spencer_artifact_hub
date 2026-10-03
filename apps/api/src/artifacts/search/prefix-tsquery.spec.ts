import { prefixTsquery } from './prefix-tsquery.js';

describe('prefixTsquery', () => {
  it.each([
    ['pricing', 'pricing:*'],
    ['  Pricing   Page ', 'pricing:* & page:*'],
    ["Q3 roadmap (draft) & isn't | !!", 'q3:* & roadmap:* & draft:* & isn:* & t:*'],
    ['Überblick café', 'überblick:* & café:*'],
    [
      'one two three four five six seven eight nine',
      'one:* & two:* & three:* & four:* & five:* & six:* & seven:* & eight:*',
    ],
  ])('turns %j into %j', (text, query) => {
    expect(prefixTsquery(text)).toBe(query);
  });

  it.each(['', '   ', '&|!():*'])('returns null for %j', (text) => {
    expect(prefixTsquery(text)).toBeNull();
  });
});
