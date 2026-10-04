import { searchPrompt, toSearchFilters } from './search-interpretation.js';
import type { SearchAnswer, SearchContext } from './search.types.js';

const context: SearchContext = {
  text: 'the pricing deck Sara shared last week',
  scope: 'mine',
  owners: [
    { displayName: 'Sara Lee', email: 'sara@acme.test' },
    { displayName: 'Tom Ray', email: 'tom@acme.test' },
  ],
  today: '2026-10-04',
};

const empty: SearchAnswer = {
  keywords: null,
  scope: null,
  type: null,
  owners: [],
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
          owners: [' Sara ', 'Sara', 'sara@acme.test', ''],
          updatedFrom: '2026-09-28',
          updatedTo: '2026-10-04',
        },
        context,
      ),
    ).toEqual({
      scope: 'shared',
      q: 'pricing',
      type: 'pdf',
      owner: ['Sara', 'sara@acme.test'],
      updatedFrom: '2026-09-28',
      updatedTo: '2026-10-04',
    });
  });

  it('keeps the current scope and leaves out what the answer leaves empty', () => {
    expect(toSearchFilters({ ...empty, keywords: '  ', owners: ['', ' '] }, context)).toEqual({
      scope: 'mine',
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
      { ...empty, keywords: 'a'.repeat(300), owners: ['b'.repeat(300)] },
      context,
    );
    expect(filters.q).toHaveLength(200);
    expect(filters.owner?.[0]).toHaveLength(100);
  });
});

it('keeps at most as many owners as the filter takes', () => {
  const owners = Array.from({ length: 15 }, (_, i) => `person ${i}`);
  expect(toSearchFilters({ ...empty, owners }, context).owner).toHaveLength(10);
});

describe('searchPrompt', () => {
  it('gives the date, tab and owners, with the user text in untrusted blocks', () => {
    const prompt = searchPrompt(context);
    expect(prompt).toContain('Today is 2026-10-04 (UTC). The current tab is "mine".');
    expect(prompt).toContain(
      '<untrusted_content source="owners">\nSara Lee <sara@acme.test>\nTom Ray <tom@acme.test>\n',
    );
    expect(prompt).toContain(
      '<untrusted_content source="search">\nthe pricing deck Sara shared last week\n',
    );
  });
});
