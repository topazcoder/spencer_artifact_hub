import { searchPrompt, toSearchFilters } from './search-interpretation.js';
import type { SearchAnswer, SearchContext } from './search.types.js';

const context: SearchContext = {
  text: 'the pricing deck Sara shared last week',
  scope: 'mine',
  tags: ['marketing', 'q3 launch'],
  today: '2026-10-04',
};

const empty: SearchAnswer = {
  keywords: null,
  scope: null,
  type: null,
  tag: null,
  owner: null,
  updatedFrom: null,
  updatedTo: null,
};

describe('toSearchFilters', () => {
  it('keeps the filters the answer fills', () => {
    expect(
      toSearchFilters(
        {
          keywords: ' pricing ',
          scope: 'shared',
          type: 'pdf',
          tag: 'Marketing',
          owner: ' Sara ',
          updatedFrom: '2026-09-28',
          updatedTo: '2026-10-04',
        },
        context,
      ),
    ).toEqual({
      scope: 'shared',
      q: 'pricing',
      type: 'pdf',
      tag: ['marketing'],
      owner: 'Sara',
      updatedFrom: '2026-09-28',
      updatedTo: '2026-10-04',
    });
  });

  it('keeps the current scope and leaves out what the answer leaves empty', () => {
    expect(toSearchFilters({ ...empty, keywords: '  ', owner: '' }, context)).toEqual({
      scope: 'mine',
    });
  });

  it('turns a tag nobody uses into a keyword', () => {
    expect(toSearchFilters({ ...empty, keywords: 'deck', tag: 'pricing' }, context)).toMatchObject({
      q: 'deck pricing',
      tag: undefined,
    });
  });

  it('drops invalid dates and puts dates in order', () => {
    expect(
      toSearchFilters({ ...empty, updatedFrom: 'last week', updatedTo: '2026-02-30' }, context),
    ).toEqual({ scope: 'mine' });
    expect(
      toSearchFilters({ ...empty, updatedFrom: '2026-10-04', updatedTo: '2026-09-01' }, context),
    ).toMatchObject({ updatedFrom: '2026-09-01', updatedTo: '2026-10-04' });
  });

  it('caps the lengths of keywords and owner', () => {
    const filters = toSearchFilters(
      { ...empty, keywords: 'a'.repeat(300), owner: 'b'.repeat(300) },
      context,
    );
    expect(filters.q).toHaveLength(200);
    expect(filters.owner).toHaveLength(100);
  });
});

describe('searchPrompt', () => {
  it('gives the date, tab and tags, with the user text in untrusted blocks', () => {
    const prompt = searchPrompt(context);
    expect(prompt).toContain('Today is 2026-10-04 (UTC). The current tab is "mine".');
    expect(prompt).toContain('<untrusted_content source="tags">\nmarketing, q3 launch\n');
    expect(prompt).toContain(
      '<untrusted_content source="search">\nthe pricing deck Sara shared last week\n',
    );
  });
});
