import { ErrorCode } from '@artifact-hub/shared';
import type { ContentHint } from './content.types.js';
import { fixtures } from '../../../test/fixtures/content.js';
import { detectContentType, textFormatFromFilename } from './detect-content-type.js';

async function detect(content: Buffer | string, hint?: ContentHint) {
  return detectContentType(typeof content === 'string' ? Buffer.from(content) : content, hint);
}

async function expectUnsupported(content: Buffer | string, hint?: ContentHint, reason?: RegExp) {
  const result = detect(content, hint);
  await expect(result).rejects.toMatchObject({ code: ErrorCode.UNSUPPORTED_TYPE });
  if (reason) await expect(result).rejects.toThrow(reason);
}

describe('detectContentType', () => {
  describe('binary formats', () => {
    it.each([
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
      ['gif', 'image/gif'],
      ['webp', 'image/webp'],
      ['pdf', 'application/pdf'],
    ] as const)('detects %s from its magic bytes', async (name, mime) => {
      expect(await detect(fixtures[name])).toBe(mime);
    });

    it('ignores the filename and the claimed text format', async () => {
      expect(await detect(fixtures.png, { filename: 'page.html' })).toBe('image/png');
      expect(await detect(fixtures.pdf, { filename: 'notes.md', textFormat: 'markdown' })).toBe(
        'application/pdf',
      );
    });

    it.each(['zip', 'exe'] as const)('rejects %s, even with an allowed extension', async (name) => {
      await expectUnsupported(fixtures[name], { filename: 'image.png' });
      await expectUnsupported(fixtures[name], { filename: 'notes.md' });
    });
  });

  describe('with an extension or explicit format', () => {
    it('accepts any UTF-8 text as Markdown, including inline HTML', async () => {
      expect(await detect(fixtures.markdown, { filename: 'NOTES.MD' })).toBe('text/markdown');
      expect(await detect('<div>raw</div>', { filename: 'a.markdown' })).toBe('text/markdown');
      expect(await detect(fixtures.svg, { textFormat: 'markdown' })).toBe('text/markdown');
    });

    it('accepts HTML documents and fragments for .html and .htm', async () => {
      expect(await detect(fixtures.html, { filename: 'page.html' })).toBe('text/html');
      expect(await detect('  <div class="card">x</div>', { filename: 'card.htm' })).toBe(
        'text/html',
      );
      expect(await detect('<!-- generated -->\n<section></section>', { textFormat: 'html' })).toBe(
        'text/html',
      );
    });

    it('rejects .html files that do not start with markup', async () => {
      await expectUnsupported('# Not HTML', { filename: 'page.html' }, /does not contain HTML/);
      await expectUnsupported('1 < 2', { textFormat: 'html' });
    });

    it('accepts SVG with an XML declaration, comments and a DOCTYPE', async () => {
      const svg = [
        '﻿<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- Generator: test -->',
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      ].join('\n');
      expect(await detect(svg, { filename: 'logo.svg' })).toBe('image/svg+xml');
    });

    it('rejects .svg files without an <svg> root', async () => {
      await expectUnsupported(fixtures.html, { filename: 'logo.svg' }, /does not contain an SVG/);
      await expectUnsupported('<svgx></svgx>', { textFormat: 'svg' });
      await expectUnsupported('<?xml version="1.0"?><note/>', { filename: 'logo.svg' });
    });

    it('rejects SVG DOCTYPEs with an internal subset (entity declarations)', async () => {
      const svg = '<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg"/>';
      await expectUnsupported(svg, { filename: 'bomb.svg' });
    });

    it('prefers the explicit format over the extension', async () => {
      expect(await detect(fixtures.markdown, { filename: 'x.html', textFormat: 'markdown' })).toBe(
        'text/markdown',
      );
    });
  });

  describe('without a usable extension', () => {
    it.each([undefined, 'artifact', 'artifact.txt', 'artifact.png'])(
      'sniffs SVG and full HTML documents (filename %j)',
      async (filename) => {
        expect(await detect(fixtures.svg, { filename })).toBe('image/svg+xml');
        expect(await detect(fixtures.html, { filename })).toBe('text/html');
        expect(await detect('<html lang="en"><body></body></html>', { filename })).toBe(
          'text/html',
        );
      },
    );

    it('rejects HTML fragments, Markdown and other text', async () => {
      await expectUnsupported('<div>fragment</div>');
      await expectUnsupported(fixtures.markdown, { filename: 'notes.txt' });
      await expectUnsupported('const x = 1;', { filename: 'script.js' });
      await expectUnsupported('a,b\n1,2', { filename: 'data.csv' });
    });
  });

  describe('text encoding', () => {
    it('rejects invalid UTF-8 even with a text extension', async () => {
      await expectUnsupported(Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x41]), { filename: 'a.md' });
    });

    it('rejects text containing NUL bytes', async () => {
      await expectUnsupported(Buffer.from('# a\0b'), { filename: 'a.md' });
    });

    it('accepts a multi-byte character cut off at the end of the head', async () => {
      const head = Buffer.from('# café ✓').subarray(0, -1);
      expect(await detect(head, { filename: 'a.md' })).toBe('text/markdown');
    });

    it('rejects empty content', async () => {
      await expectUnsupported(Buffer.alloc(0), { filename: 'a.md' }, /empty/);
    });
  });

  it('stays fast on pathological whitespace', async () => {
    const started = performance.now();
    await expectUnsupported(`<!DOCTYPE svg>${' '.repeat(60_000)}x`, { filename: 'a.svg' });
    await expectUnsupported(`${' \t\n'.repeat(20_000)}<svgx>`);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('textFormatFromFilename', () => {
  it('maps known extensions, case-insensitively, and nothing else', () => {
    expect(textFormatFromFilename('a.HTM')).toBe('html');
    expect(textFormatFromFilename('dir/a.svg')).toBe('svg');
    expect(textFormatFromFilename('a.tar.md')).toBe('markdown');
    expect(textFormatFromFilename('md')).toBeUndefined();
    expect(textFormatFromFilename('.md')).toBeUndefined();
    expect(textFormatFromFilename(undefined)).toBeUndefined();
  });
});
