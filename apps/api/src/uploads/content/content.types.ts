import type { Readable } from 'node:stream';
import type { ArtifactMimeType, TextFormat } from '@artifact-hub/shared';

/** What the client tells us about the content. Used only to choose among text formats. */
export interface ContentHint {
  /** Original filename; only its extension is read. */
  filename?: string;
  /** Explicit text format (MCP inline content). Takes precedence over the filename. */
  textFormat?: TextFormat;
}

export interface InspectedContent {
  mimeType: ArtifactMimeType;
  /**
   * The full content, starting with the bytes read for detection. Errors with
   * `ARTIFACT_TOO_LARGE` past the size limit, and with `UNSUPPORTED_TYPE` if text content
   * turns out not to be UTF-8 further in.
   */
  body: Readable;
}

/**
 * Why content was refused, in `UNSUPPORTED_TYPE` details, so each client can word it: the web
 * app talks about files, MCP about the text it sent.
 */
export type UnsupportedContentReason =
  | 'empty'
  /** A binary format outside the allowlist (zip, executable, …). */
  | 'other_type'
  /** Neither an allowed binary format nor UTF-8 text. */
  | 'not_text'
  | 'not_utf8'
  | 'nul_bytes'
  /** Declared (or named) SVG without an `<svg>` root. */
  | 'not_svg'
  /** Declared (or named) HTML without markup. */
  | 'not_html'
  /** Text that is neither SVG nor an HTML document, with no format or extension to go by. */
  | 'unknown_text';

/** `details` of an `UNSUPPORTED_TYPE` error. */
export interface UnsupportedContentDetails {
  reason: UnsupportedContentReason;
  allowed: readonly ArtifactMimeType[];
}
