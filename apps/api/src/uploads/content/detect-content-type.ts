import path from 'node:path';
import {
  type ArtifactMimeType,
  BINARY_MIME_TYPES,
  TEXT_FORMAT_MIME_TYPES,
  type TextFormat,
} from '@artifact-hub/shared';
import { fileTypeFromBuffer } from 'file-type';
import type { ContentHint } from './content.types.js';
import { unsupported } from './unsupported-type.js';

/** Bytes read before deciding the type; enough for magic bytes and any sane text prologue. */
export const DETECTION_HEAD_BYTES = 64 * 1024;

const TEXT_EXTENSIONS: Record<string, TextFormat> = {
  '.html': 'html',
  '.htm': 'html',
  '.svg': 'svg',
  '.md': 'markdown',
  '.markdown': 'markdown',
};

// Repeated groups match single whitespace characters (`\s`, not `\s+`) so a failed match
// can't backtrack exponentially on long runs of whitespace.
/** Leading whitespace, comments and processing instructions (`<?xml …?>`). */
const PROLOGUE = /^(?:\s|<!--[\s\S]*?-->|<\?[\s\S]*?\?>)*/;
/** An `<svg>` root, optionally after a DOCTYPE without an internal subset (no entity tricks). */
const SVG_ROOT = /^(?:<!doctype\s+svg[^[>]*>(?:\s|<!--[\s\S]*?-->)*)?<svg[\s/>]/i;
/** Unmistakably a full HTML document; required when no extension says "HTML". */
const HTML_DOCUMENT = /^<(?:!doctype\s+html|html)[\s>]/i;
/** Starts with a tag or a DOCTYPE; enough for a file that says it is HTML. */
const HTML_MARKUP = /^<(?:!doctype\s|[a-z])/i;

/**
 * Decides the content type from the first bytes of the content (`head`), per the plan (§6):
 * - Binary formats come from magic bytes alone; the filename is ignored.
 * - Text must be UTF-8. The hint (explicit format, else extension) picks HTML, SVG or
 *   Markdown, and the content must match it. Without a usable hint the content must be an
 *   unmistakable SVG or HTML document; Markdown always needs `.md` or an explicit format.
 *
 * Throws `UNSUPPORTED_TYPE` for anything else, including empty content.
 */
export async function detectContentType(
  head: Buffer,
  hint: ContentHint = {},
): Promise<ArtifactMimeType> {
  if (head.length === 0) throw unsupported('empty', 'The file is empty.');

  const detected = await fileTypeFromBuffer(head);
  if (detected && isBinaryMimeType(detected.mime)) return detected.mime;
  // file-type reports text that starts with `<?xml` as XML; SVG is checked below.
  if (detected && detected.mime !== 'application/xml') throw unsupported('other_type');

  const text = decodeUtf8Head(head);
  if (text === null || text.includes('\0')) throw unsupported('not_text');
  const markup = text.replace(/^﻿/, '').replace(PROLOGUE, '');

  const format = hint.textFormat ?? textFormatFromFilename(hint.filename);
  switch (format) {
    case 'markdown':
      return TEXT_FORMAT_MIME_TYPES.markdown;
    case 'svg':
      if (!SVG_ROOT.test(markup))
        throw unsupported('not_svg', 'The file does not contain an SVG image.');
      return TEXT_FORMAT_MIME_TYPES.svg;
    case 'html':
      if (!HTML_MARKUP.test(markup))
        throw unsupported('not_html', 'The file does not contain HTML markup.');
      return TEXT_FORMAT_MIME_TYPES.html;
    case undefined:
      if (SVG_ROOT.test(markup)) return TEXT_FORMAT_MIME_TYPES.svg;
      if (HTML_DOCUMENT.test(markup)) return TEXT_FORMAT_MIME_TYPES.html;
      throw unsupported('unknown_text');
  }
}

export function textFormatFromFilename(filename: string | undefined): TextFormat | undefined {
  if (!filename) return undefined;
  return TEXT_EXTENSIONS[path.extname(filename).toLowerCase()];
}

function isBinaryMimeType(mime: string): mime is (typeof BINARY_MIME_TYPES)[number] {
  return (BINARY_MIME_TYPES as readonly string[]).includes(mime);
}

/** Decodes as UTF-8, or returns null if invalid. A character cut off at the end is fine. */
function decodeUtf8Head(head: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
  } catch {
    return null;
  }
}
