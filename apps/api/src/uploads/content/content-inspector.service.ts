import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { type ArtifactMimeType, TEXT_FORMAT_MIME_TYPES } from '@artifact-hub/shared';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { ByteMeter } from './byte-meter.js';
import type { ContentHint, InspectedContent } from './content.types.js';
import { DETECTION_HEAD_BYTES, detectContentType } from './detect-content-type.js';
import { Utf8Validator } from './utf8-validator.js';

const TEXT_MIME_TYPES: ReadonlySet<ArtifactMimeType> = new Set(
  Object.values(TEXT_FORMAT_MIME_TYPES),
);

/**
 * Upload pipeline steps 1–2 (plan §6): enforces `MAX_ARTIFACT_BYTES` while the content streams
 * in, and decides its type from the content itself.
 */
@Injectable()
export class ContentInspectorService {
  constructor(@InjectEnv() private readonly env: Env) {}

  get maxBytes(): number {
    return this.env.MAX_ARTIFACT_BYTES;
  }

  /**
   * Reads the first bytes of `source` and detects the type; rejects with `UNSUPPORTED_TYPE`
   * or `ARTIFACT_TOO_LARGE` (and destroys `source`) when they already rule it out. The rest
   * is checked as the returned `body` is consumed, so pipe it straight into storage: a
   * failure there leaves no blob behind.
   */
  async inspect(source: Readable, hint: ContentHint = {}): Promise<InspectedContent> {
    const chunks = source[Symbol.asyncIterator]() as AsyncIterator<Buffer | string>;
    const meter = new ByteMeter(this.maxBytes);
    const headChunks: Buffer[] = [];
    let headSize = 0;
    let ended = false;

    try {
      while (headSize < DETECTION_HEAD_BYTES) {
        const next = await chunks.next();
        if (next.done) {
          ended = true;
          break;
        }
        const chunk = meter.add(next.value);
        headChunks.push(chunk);
        headSize += chunk.length;
      }
      const head = Buffer.concat(headChunks);
      const mimeType = await detectContentType(head.subarray(0, DETECTION_HEAD_BYTES), hint);
      const utf8 = TEXT_MIME_TYPES.has(mimeType) ? new Utf8Validator() : null;

      async function* content(): AsyncGenerator<Buffer> {
        try {
          utf8?.write(head);
          yield head;
          if (ended) return;
          for (let next = await chunks.next(); !next.done; next = await chunks.next()) {
            const chunk = meter.add(next.value);
            utf8?.write(chunk);
            yield chunk;
          }
          utf8?.end();
        } finally {
          // Stops and destroys `source` if the consumer gave up or a check failed.
          await chunks.return?.();
        }
      }

      return { mimeType, body: Readable.from(content(), { objectMode: false }) };
    } catch (error) {
      await chunks.return?.();
      throw error;
    }
  }
}
