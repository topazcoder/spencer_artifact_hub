import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { type Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobNotFoundError, BlobSizeMismatchError, InvalidBlobKeyError } from './storage.errors.js';
import type { BlobStat, ByteRange, PutOptions, PutResult, StorageDriver } from './storage.types.js';

/** `/`-separated segments of letters, digits, `-` and `_`. No dots, so no `..` and no `.tmp`. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9][A-Za-z0-9_-]*)*$/;
const KEY_MAX_LENGTH = 512;

/**
 * Stores blobs as files under `root` (a Railway volume in production). Writes are atomic:
 * the body streams to a temporary file that is flushed to disk and then renamed into place,
 * so a reader never sees a partial blob. Leftover `*.tmp` files from a crash are removed by
 * the sweeper.
 */
export class LocalStorageService implements StorageDriver {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Creates the root directory. Called once at boot. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, body: Readable, opts: PutOptions): Promise<PutResult> {
    const target = this.resolve(key);
    const dir = path.dirname(target);
    await mkdir(dir, { recursive: true });
    if (await this.exists(target)) throw new Error(`Blob already exists: ${key}`);

    const tmp = `${target}.${randomUUID()}.tmp`;
    const hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        size += chunk.length;
        callback(null, chunk);
      },
    });

    try {
      // `flush: true` fsyncs the file before it is closed.
      await pipeline(body, meter, createWriteStream(tmp, { flags: 'wx', flush: true }));
      if (opts.size !== undefined && size !== opts.size) {
        throw new BlobSizeMismatchError(opts.size, size);
      }
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    await syncDirectory(dir);
    return { size, sha256: hash.digest('hex') };
  }

  async getStream(key: string, range?: ByteRange): Promise<Readable> {
    if (range) assertValidRange(range);
    const target = this.resolve(key);
    try {
      const handle = await open(target, 'r');
      return handle.createReadStream(range ? { start: range.start, end: range.end } : {});
    } catch (error) {
      if (isNotFound(error)) throw new BlobNotFoundError(key);
      throw error;
    }
  }

  async stat(key: string): Promise<BlobStat | null> {
    try {
      const stats = await stat(this.resolve(key));
      return stats.isFile() ? { size: stats.size } : null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Maps a key to its file path, refusing anything that could leave the root. */
  private resolve(key: string): string {
    if (key.length > KEY_MAX_LENGTH || !KEY_PATTERN.test(key)) throw new InvalidBlobKeyError(key);
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new InvalidBlobKeyError(key);
    return target;
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await stat(target);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}

function assertValidRange({ start, end }: ByteRange): void {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new RangeError(`Invalid byte range ${start}-${end}`);
  }
}

/** Makes the rename itself durable. Best effort: not every platform can fsync a directory. */
async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await open(dir, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // The data is already flushed; only the directory entry's durability is at stake.
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
