import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ErrorCode } from '@artifact-hub/shared';
import { fixtures } from '../../../test/fixtures/content.js';
import type { Env } from '../../config/config.types.js';
import { LocalStorageService } from '../../storage/local-storage.service.js';
import { ContentInspectorService } from './content-inspector.service.js';
import { DETECTION_HEAD_BYTES } from './detect-content-type.js';

function inspector(maxBytes = 1024 * 1024) {
  return new ContentInspectorService({ MAX_ARTIFACT_BYTES: maxBytes } as Env);
}

/** Splits `content` into small chunks, like a network upload. */
function chunked(content: Buffer, size = 7): Readable {
  const chunks: Buffer[] = [];
  for (let i = 0; i < content.length; i += size) chunks.push(content.subarray(i, i + size));
  return Readable.from(chunks);
}

/** A large Markdown file: a heading, then `size` bytes of filler, then `tail`. */
function markdown(size: number, tail: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([Buffer.from('# Big\n'), Buffer.alloc(size, 'a'), tail]);
}

describe('ContentInspectorService', () => {
  it('detects the type and passes the whole content through unchanged', async () => {
    const content = markdown(3 * DETECTION_HEAD_BYTES);
    const { mimeType, body } = await inspector().inspect(chunked(content, 1000), {
      filename: 'big.md',
    });
    expect(mimeType).toBe('text/markdown');
    expect((await buffer(body)).equals(content)).toBe(true);
  });

  it('handles content shorter than the detection head', async () => {
    const { mimeType, body } = await inspector().inspect(chunked(fixtures.png));
    expect(mimeType).toBe('image/png');
    expect((await buffer(body)).equals(fixtures.png)).toBe(true);
  });

  it('rejects an unsupported type before reading further, and destroys the source', async () => {
    const source = chunked(Buffer.concat([fixtures.zip, Buffer.alloc(DETECTION_HEAD_BYTES * 2)]));
    await expect(inspector().inspect(source, { filename: 'a.png' })).rejects.toMatchObject({
      code: ErrorCode.UNSUPPORTED_TYPE,
    });
    expect(source.destroyed).toBe(true);
  });

  describe('size limit', () => {
    it('accepts content of exactly the limit', async () => {
      const content = markdown(100);
      const { body } = await inspector(content.length).inspect(chunked(content), {
        filename: 'a.md',
      });
      expect((await buffer(body)).length).toBe(content.length);
    });

    it('rejects content over the limit while reading the head', async () => {
      const source = chunked(markdown(100));
      await expect(inspector(50).inspect(source, { filename: 'a.md' })).rejects.toMatchObject({
        code: ErrorCode.ARTIFACT_TOO_LARGE,
        details: { maxBytes: 50 },
      });
      expect(source.destroyed).toBe(true);
    });

    it('rejects content over the limit while streaming the rest', async () => {
      const limit = DETECTION_HEAD_BYTES * 2;
      const source = chunked(markdown(limit), 4096);
      const { body } = await inspector(limit).inspect(source, { filename: 'a.md' });
      await expect(buffer(body)).rejects.toMatchObject({ code: ErrorCode.ARTIFACT_TOO_LARGE });
      expect(source.destroyed).toBe(true);
    });

    it('names the limit in the message', async () => {
      const source = chunked(markdown(1024 * 1024), 65536);
      const { body } = await inspector(1024 * 1024).inspect(source, { filename: 'a.md' });
      await expect(buffer(body)).rejects.toThrow('larger than the 1 MB limit');
    });
  });

  describe('UTF-8 beyond the detection head', () => {
    it('rejects invalid bytes after the head', async () => {
      const content = markdown(DETECTION_HEAD_BYTES, Buffer.from([0xc3, 0x28]));
      const { body } = await inspector().inspect(chunked(content, 4096), { filename: 'a.md' });
      await expect(buffer(body)).rejects.toMatchObject({ code: ErrorCode.UNSUPPORTED_TYPE });
    });

    it('rejects content that ends in the middle of a character', async () => {
      const content = markdown(DETECTION_HEAD_BYTES, Buffer.from([0xe2, 0x9c]));
      const { body } = await inspector().inspect(chunked(content, 4096), { filename: 'a.md' });
      await expect(buffer(body)).rejects.toThrow(/UTF-8/);
    });

    it('accepts multi-byte characters split across chunks', async () => {
      const content = markdown(DETECTION_HEAD_BYTES, Buffer.from('✓ é 𝄞'.repeat(50)));
      const { body } = await inspector().inspect(chunked(content, 3), { filename: 'a.md' });
      expect((await buffer(body)).equals(content)).toBe(true);
    });

    it('does not apply text checks to binary formats', async () => {
      const content = Buffer.concat([fixtures.pdf, Buffer.from([0xff, 0x00, 0xfe])]);
      const { body } = await inspector().inspect(chunked(content));
      expect((await buffer(body)).equals(content)).toBe(true);
    });
  });

  describe('with local storage', () => {
    let root: string;
    let storage: LocalStorageService;

    beforeEach(async () => {
      root = await mkdtemp(path.join(os.tmpdir(), 'artifact-hub-inspect-'));
      storage = new LocalStorageService(root);
      await storage.init();
    });

    afterEach(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it('stores valid content', async () => {
      const { mimeType, body } = await inspector().inspect(chunked(fixtures.svg), {
        filename: 'logo.svg',
      });
      const stored = await storage.put('blob', body, { contentType: mimeType });
      expect(stored.size).toBe(fixtures.svg.length);
    });

    it('leaves nothing behind when the content fails a check mid-stream', async () => {
      const limit = DETECTION_HEAD_BYTES * 2;
      const { mimeType, body } = await inspector(limit).inspect(chunked(markdown(limit), 4096), {
        filename: 'a.md',
      });
      await expect(storage.put('blob', body, { contentType: mimeType })).rejects.toMatchObject({
        code: ErrorCode.ARTIFACT_TOO_LARGE,
      });
      expect(await readdir(root)).toEqual([]);
    });
  });
});
