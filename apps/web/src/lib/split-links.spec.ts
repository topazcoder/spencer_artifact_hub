import { describe, expect, it } from 'vitest';
import { splitLinks } from './split-links.ts';

describe('splitLinks', () => {
  it('finds http and https links between plain text', () => {
    expect(splitLinks('See https://example.com/a?b=1 and http://x.io')).toEqual([
      { type: 'text', text: 'See ' },
      { type: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', text: ' and ' },
      { type: 'link', text: 'http://x.io', href: 'http://x.io' },
    ]);
  });

  it('leaves text without links alone, markup included', () => {
    expect(splitLinks('<b>bold</b>')).toEqual([{ type: 'text', text: '<b>bold</b>' }]);
    expect(splitLinks('')).toEqual([]);
  });

  it('never links other schemes', () => {
    expect(splitLinks('javascript:alert(1) data:text/html,x ftp://x.io')).toEqual([
      { type: 'text', text: 'javascript:alert(1) data:text/html,x ftp://x.io' },
    ]);
  });

  it('leaves out the punctuation that ends a sentence', () => {
    expect(splitLinks('(see https://x.io/a).')).toEqual([
      { type: 'text', text: '(see ' },
      { type: 'link', text: 'https://x.io/a', href: 'https://x.io/a' },
      { type: 'text', text: ').' },
    ]);
    expect(splitLinks('Is it https://x.io?')).toEqual([
      { type: 'text', text: 'Is it ' },
      { type: 'link', text: 'https://x.io', href: 'https://x.io' },
      { type: 'text', text: '?' },
    ]);
  });

  it('keeps brackets that belong to the URL', () => {
    const wiki = 'https://en.wikipedia.org/wiki/Mercury_(planet)';
    expect(splitLinks(`${wiki}.`)).toEqual([
      { type: 'link', text: wiki, href: wiki },
      { type: 'text', text: '.' },
    ]);
  });

  it('ends a link at whitespace or a quote', () => {
    expect(splitLinks('"https://x.io/a"\nnext')).toEqual([
      { type: 'text', text: '"' },
      { type: 'link', text: 'https://x.io/a', href: 'https://x.io/a' },
      { type: 'text', text: '"\nnext' },
    ]);
  });
});
