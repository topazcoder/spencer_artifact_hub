import { sanitizeFilename } from './sanitize-filename.js';

describe('sanitizeFilename', () => {
  it('keeps ordinary names', () => {
    expect(sanitizeFilename('Pricing page v2.html')).toBe('Pricing page v2.html');
    expect(sanitizeFilename('résumé.pdf')).toBe('résumé.pdf');
  });

  it('drops directory parts from either separator', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\ada\\logo.svg')).toBe('logo.svg');
  });

  it('removes control and bidi-override characters and collapses whitespace', () => {
    expect(sanitizeFilename('in\u0000voice\r\n.pdf')).toBe('invoice.pdf');
    expect(sanitizeFilename('report\u202Efdp.exe')).toBe('reportfdp.exe');
    expect(sanitizeFilename('  a \t  b.md  ')).toBe('a b.md');
  });

  it('returns null when nothing usable is left', () => {
    for (const name of [undefined, null, '', '   ', '/', '..', 'dir/', '\u0000']) {
      expect(sanitizeFilename(name)).toBeNull();
    }
  });

  it('caps the length but keeps the extension', () => {
    const result = sanitizeFilename(`${'a'.repeat(300)}.html`);
    expect(result).toHaveLength(255);
    expect(result?.endsWith('.html')).toBe(true);
  });
});
