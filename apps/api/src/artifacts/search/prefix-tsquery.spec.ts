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

  it('treats words joined by | as alternatives', () => {
    expect(prefixTsquery('Pricing|price|rates deck')).toBe(
      '(pricing:* | price:* | rates:*) & deck:*',
    );
    expect(prefixTsquery('a|b|c|d|e|f|g')).toBe('(a:* | b:* | c:* | d:* | e:*)');
  });

  it('can match any word instead of all', () => {
    expect(prefixTsquery('pricing|price deck', 'any')).toBe('pricing:* | price:* | deck:*');
    expect(prefixTsquery('pricing', 'any')).toBe('pricing:*');
    expect(prefixTsquery('&|!', 'any')).toBeNull();
  });

  it.each(['', '   ', '&|!():*'])('returns null for %j', (text) => {
    expect(prefixTsquery(text)).toBeNull();
  });
});
