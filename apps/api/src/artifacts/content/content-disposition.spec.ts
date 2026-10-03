import { attachmentDisposition, downloadFilename } from './content-disposition.js';

describe('downloadFilename', () => {
  it('keeps the original filename when its extension matches', () => {
    expect(downloadFilename('Pricing v2.HTML', 'x', 'text/html')).toBe('Pricing v2.HTML');
    expect(downloadFilename('photo.jpeg', 'x', 'image/jpeg')).toBe('photo.jpeg');
  });

  it("replaces another artifact type's extension with the real one", () => {
    expect(downloadFilename('page.html', 'x', 'image/png')).toBe('page.png');
  });

  it('appends the extension when there is none or an unrelated one', () => {
    expect(downloadFilename('report', 'x', 'application/pdf')).toBe('report.pdf');
    expect(downloadFilename('report.v2', 'x', 'application/pdf')).toBe('report.v2.pdf');
  });

  it('falls back to the title, then to "artifact"', () => {
    expect(downloadFilename(null, 'Q3 / roadmap', 'text/markdown')).toBe('Q3 - roadmap.md');
    expect(downloadFilename(null, '\u0000', 'image/svg+xml')).toBe('artifact.svg');
  });
});

describe('attachmentDisposition', () => {
  it('sends an ASCII fallback and the exact UTF-8 name', () => {
    expect(attachmentDisposition('Résumé "final".pdf')).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
  });

  it("percent-encodes characters that encodeURIComponent leaves alone in RFC 5987's view", () => {
    expect(attachmentDisposition("it's (1)*.md")).toContain(
      "filename*=UTF-8''it%27s%20%281%29%2A.md",
    );
  });
});
