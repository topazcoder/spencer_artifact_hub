import { parseArtifactRef } from './artifact-ref.js';

const ID = '3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b';

describe('parseArtifactRef', () => {
  it.each([
    [ID, { id: ID }],
    [` ${ID.toUpperCase()} `, { id: ID }],
    [`https://hub.example.com/artifacts/${ID}`, { id: ID }],
    [`http://localhost:5173/artifacts/${ID}/`, { id: ID }],
    [`https://hub.example.com/artifacts/${ID}?v=3`, { id: ID, versionNo: 3 }],
    [`https://hub.example.com/artifacts/${ID}?v=0`, { id: ID }],
    [`https://hub.example.com/artifacts/${ID}?v=abc#feedback`, { id: ID }],
  ])('reads %s', (input, expected) => {
    expect(parseArtifactRef(input)).toEqual(expected);
  });

  it.each([
    'pricing page',
    'not-a-uuid',
    `https://hub.example.com/artifacts/not-a-uuid`,
    `https://hub.example.com/other/${ID}`,
    `https://hub.example.com/artifacts/${ID}/versions/1/content`,
  ])('rejects %s, saying what to pass', (input) => {
    expect(() => parseArtifactRef(input)).toThrow(/artifact's id or its page URL/);
  });

  it('explains that share links are not artifact URLs', () => {
    expect(() => parseArtifactRef('https://hub.example.com/s/abcdef')).toThrow(/share link/);
  });
});
