import { createHash } from 'node:crypto';
import type { ArtifactVersion } from '../../artifacts/artifact-version.entity.js';
import { ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../../common/errors/app-error.js';
import { ByteMeter } from '../../uploads/content/byte-meter.js';
import { unsupported } from '../../uploads/content/unsupported-type.js';
import {
  formatForRevision,
  inlineContent,
  inlineContentError,
  inlineContentIdentity,
} from './inline-content.js';

const version = (mimeType: string) => ({ mimeType }) as ArtifactVersion;

describe('inlineContent', () => {
  it('streams the text as UTF-8, with its format', async () => {
    const { stream, textFormat } = inlineContent('<h1>Héllo</h1>', 'html');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('<h1>Héllo</h1>');
    expect(textFormat).toBe('html');
  });
});

describe('inlineContentIdentity', () => {
  it("is the hash of the UTF-8 bytes and the format's type", () => {
    expect(inlineContentIdentity('# Héllo', 'markdown')).toEqual({
      sha256: createHash('sha256').update(Buffer.from('# Héllo', 'utf8')).digest('hex'),
      mimeType: 'text/markdown',
    });
  });
});

describe('formatForRevision', () => {
  it('takes the given format', () => {
    expect(formatForRevision('svg', version('text/html'))).toBe('svg');
  });

  it.each([
    ['text/html', 'html'],
    ['image/svg+xml', 'svg'],
    ['text/markdown', 'markdown'],
  ])("keeps the current version's text format (%s)", (mimeType, format) => {
    expect(formatForRevision(undefined, version(mimeType))).toBe(format);
  });

  it('asks for the format when the current version is binary, or there is none', () => {
    expect(() => formatForRevision(undefined, version('image/png'))).toThrow(/Say which format/);
    expect(() => formatForRevision(undefined, null)).toThrow(/Say which format/);
  });
});

describe('inlineContentError', () => {
  it.each([
    ['not_html', 'html', /not an HTML page: start it with <!DOCTYPE html>/],
    ['not_svg', 'svg', /needs an <svg> root/],
    ['other_type', 'markdown', /not markdown\. Send an HTML page/],
  ] as const)('words %s for content sent inline', (reason, format, message) => {
    const error = inlineContentError(unsupported(reason, 'The file is wrong.'), format) as AppError;
    expect(error.code).toBe(ErrorCode.UNSUPPORTED_TYPE);
    expect(error.message).toMatch(message);
    expect(error.message).not.toMatch(/file|PNG|PDF/);
  });

  it('words the size limit for content', () => {
    const error = inlineContentError(ByteMeter.tooLarge(1024), 'html') as AppError;
    expect(error).toMatchObject({ code: ErrorCode.ARTIFACT_TOO_LARGE });
    expect(error.message).toMatch(/^The content is larger than the 1 KB limit/);
  });

  it('leaves other errors alone', () => {
    const conflict = new AppError(ErrorCode.CONFLICT, 'Try again.');
    expect(inlineContentError(conflict, 'html')).toBe(conflict);
  });
});
