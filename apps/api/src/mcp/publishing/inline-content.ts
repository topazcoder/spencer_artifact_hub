import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  ErrorCode,
  formatBytes,
  TEXT_FORMAT_MIME_TYPES,
  type TextFormat,
} from '@artifact-hub/shared';
import type { ArtifactVersion } from '../../artifacts/artifact-version.entity.js';
import type { ContentIdentity, NewContent } from '../../artifacts/artifacts.types.js';
import { AppError } from '../../common/errors/app-error.js';
import type {
  UnsupportedContentDetails,
  UnsupportedContentReason,
} from '../../uploads/content/content.types.js';

/** Text sent inline by an MCP client, for the upload pipeline (which checks size and type). */
export function inlineContent(content: string, textFormat: TextFormat): NewContent {
  return { stream: Readable.from([Buffer.from(content, 'utf8')]), textFormat };
}

/**
 * What the stored version of inline text will be, to compare it with versions already there
 * before storing it again: the hash of its UTF-8 bytes, and its format's type.
 */
export function inlineContentIdentity(content: string, textFormat: TextFormat): ContentIdentity {
  return {
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    mimeType: TEXT_FORMAT_MIME_TYPES[textFormat],
  };
}

/**
 * The format of new content: as given, or the current version's when it is a text format, so
 * a revision of an HTML page needn't say "html" again.
 */
export function formatForRevision(
  given: TextFormat | undefined,
  current: ArtifactVersion | null,
): TextFormat {
  if (given) return given;
  const formats = Object.entries(TEXT_FORMAT_MIME_TYPES) as [TextFormat, string][];
  const same = formats.find(([, mimeType]) => mimeType === current?.mimeType)?.[0];
  if (same) return same;
  throw new AppError(
    ErrorCode.VALIDATION_FAILED,
    'Say which format the new content is in: html, svg or markdown.',
  );
}

const SEND_TEXT =
  'Send an HTML page, an SVG image or a Markdown document as text, with the matching format.';

/** What an agent is told for each reason the upload pipeline refuses content. */
const REFUSALS: Record<UnsupportedContentReason, (format: TextFormat) => string> = {
  empty: () => 'The content is empty.',
  not_html: () =>
    'The content is not an HTML page: start it with <!DOCTYPE html> or an <html> tag.',
  not_svg: () => 'The content is not an SVG image: it needs an <svg> root element.',
  nul_bytes: () => 'The content contains NUL characters, which text formats cannot have.',
  other_type: (format) => `The content is not ${format}. ${SEND_TEXT}`,
  not_text: (format) => `The content is not ${format}. ${SEND_TEXT}`,
  not_utf8: (format) => `The content is not ${format}. ${SEND_TEXT}`,
  unknown_text: (format) => `The content is not ${format}. ${SEND_TEXT}`,
};

/**
 * Rewords the upload pipeline's refusals, written for files in the web app, for content an
 * agent sent inline. Any other error is returned as it is.
 */
export function inlineContentError(error: unknown, format: TextFormat): unknown {
  if (!(error instanceof AppError)) return error;
  if (error.code === ErrorCode.UNSUPPORTED_TYPE) {
    const reason = (error.details as Partial<UnsupportedContentDetails> | undefined)?.reason;
    if (reason) return new AppError(error.code, REFUSALS[reason](format));
  }
  if (error.code === ErrorCode.ARTIFACT_TOO_LARGE) {
    const maxBytes = (error.details as { maxBytes?: unknown } | undefined)?.maxBytes;
    if (typeof maxBytes === 'number') {
      return new AppError(
        error.code,
        `The content is larger than the ${formatBytes(maxBytes)} limit. Publish a smaller document.`,
      );
    }
  }
  return error;
}
