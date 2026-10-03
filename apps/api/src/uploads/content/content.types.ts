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
