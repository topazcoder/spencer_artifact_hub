import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { blobKeys } from './blob-keys.js';
import { LocalStorageService } from './local-storage.service.js';
import { BlobNotFoundError, BlobSizeMismatchError, InvalidBlobKeyError } from './storage.errors.js';

const OPTS = { contentType: 'text/plain' };

function body(...chunks: string[]): Readable {
  return Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
}

/** Emits `chunks`, then fails, like a client that disconnects mid-upload. */
function failingBody(...chunks: string[]): Readable {
  return Readable.from(
    (async function* () {
      for (const chunk of chunks) yield Buffer.from(chunk);
      throw new Error('client disconnected');
    })(),
  );
}

/** Every file under `dir`, relative to it. */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

/** A minute from now: everything already written is older. */
const later = () => new Date(Date.now() + 60_000);

/** Backdates a file under `root`, as if written two hours ago. */
async function age(root: string, relative: string) {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
  await utimes(path.join(root, relative), twoHoursAgo, twoHoursAgo);
}

/** The keys `storage.list` finds, sorted. */
async function listedKeys(
  storage: LocalStorageService,
  prefix: string,
  olderThan: Date,
): Promise<string[]> {
  const found: string[] = [];
  for await (const { key } of storage.list(prefix, olderThan)) found.push(key);
  return found.toSorted();
}

describe('LocalStorageService', () => {
  let sandbox: string;
  let root: string;
  let storage: LocalStorageService;

  beforeEach(async () => {
    sandbox = await mkdtemp(path.join(os.tmpdir(), 'artifact-hub-storage-'));
    root = path.join(sandbox, 'blobs');
    storage = new LocalStorageService(root);
    await storage.init();
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true });
  });

  describe('put', () => {
    it('stores the body and returns its size and SHA-256', async () => {
      const result = await storage.put('artifacts/a1/1-x', body('hello ', 'world'), OPTS);

      expect(result).toEqual({
        size: 11,
        sha256: createHash('sha256').update('hello world').digest('hex'),
      });
      expect(await text(await storage.getStream('artifacts/a1/1-x'))).toBe('hello world');
      expect(await listFiles(root)).toEqual([path.join('artifacts', 'a1', '1-x')]);
    });

    it('stores an empty body', async () => {
      const result = await storage.put('empty', body(), OPTS);
      expect(result.size).toBe(0);
      expect(await storage.stat('empty')).toEqual({ size: 0 });
    });

    it('accepts a body of exactly the expected size', async () => {
      await expect(storage.put('k', body('12345'), { ...OPTS, size: 5 })).resolves.toMatchObject({
        size: 5,
      });
    });

    it('rejects a body of another size and leaves nothing behind', async () => {
      await expect(storage.put('k', body('12345'), { ...OPTS, size: 4 })).rejects.toBeInstanceOf(
        BlobSizeMismatchError,
      );
      expect(await listFiles(root)).toEqual([]);
    });

    it('leaves no blob and no temporary file when the body fails mid-stream', async () => {
      await expect(storage.put('artifacts/a1/1-x', failingBody('partial'), OPTS)).rejects.toThrow(
        'client disconnected',
      );
      expect(await storage.stat('artifacts/a1/1-x')).toBeNull();
      expect(await listFiles(root)).toEqual([]);
    });

    it('never overwrites an existing blob', async () => {
      await storage.put('k', body('original'), OPTS);
      await expect(storage.put('k', body('replacement'), OPTS)).rejects.toThrow(/already exists/);
      expect(await text(await storage.getStream('k'))).toBe('original');
      expect(await listFiles(root)).toEqual(['k']);
    });
  });

  describe('getStream', () => {
    beforeEach(async () => {
      await storage.put('k', body('0123456789'), OPTS);
    });

    it('reads an inclusive byte range', async () => {
      expect(await text(await storage.getStream('k', { start: 2, end: 5 }))).toBe('2345');
      expect(await text(await storage.getStream('k', { start: 9, end: 9 }))).toBe('9');
    });

    it('rejects invalid ranges', async () => {
      await expect(storage.getStream('k', { start: 5, end: 2 })).rejects.toBeInstanceOf(RangeError);
      await expect(storage.getStream('k', { start: -1, end: 2 })).rejects.toBeInstanceOf(
        RangeError,
      );
    });

    it('throws BlobNotFoundError for a missing key', async () => {
      await expect(storage.getStream('missing')).rejects.toBeInstanceOf(BlobNotFoundError);
    });
  });

  describe('stat and delete', () => {
    it('returns null for a missing key', async () => {
      expect(await storage.stat('artifacts/none')).toBeNull();
    });

    it('deletes a blob, and deleting it again succeeds', async () => {
      await storage.put('k', body('data'), OPTS);
      await storage.delete('k');
      expect(await storage.stat('k')).toBeNull();
      await expect(storage.delete('k')).resolves.toBeUndefined();
    });
  });

  describe('list and deleteIncompleteWrites', () => {
    const HOUR_AGO = new Date(Date.now() - 3600_000);

    it('lists the blobs under a prefix written before a time', async () => {
      await storage.put('artifacts/a/1-x', body('old'), OPTS);
      await storage.put('artifacts/b/1-y', body('new'), OPTS);
      await storage.put('health/probe', body('other prefix'), OPTS);
      await age(root, 'artifacts/a/1-x');

      expect(await listedKeys(storage, 'artifacts', HOUR_AGO)).toEqual(['artifacts/a/1-x']);
      expect(await listedKeys(storage, 'artifacts', later())).toEqual([
        'artifacts/a/1-x',
        'artifacts/b/1-y',
      ]);
    });

    it('lists nothing for a prefix with no blobs, and refuses an invalid prefix', async () => {
      expect(await listedKeys(storage, 'artifacts', later())).toEqual([]);
      await expect(listedKeys(storage, '../outside', later())).rejects.toBeInstanceOf(
        InvalidBlobKeyError,
      );
    });

    it('deletes old temporary files only, leaving blobs and recent writes alone', async () => {
      await storage.put('artifacts/a/1-x', body('blob'), OPTS);
      await mkdir(path.join(root, 'artifacts/b'), { recursive: true });
      await writeFile(path.join(root, 'artifacts/b/1-y.abc.tmp'), 'crashed');
      await writeFile(path.join(root, 'artifacts/b/2-z.def.tmp'), 'still writing');
      await age(root, 'artifacts/a/1-x');
      await age(root, 'artifacts/b/1-y.abc.tmp');

      expect(await listedKeys(storage, 'artifacts', later())).toEqual(['artifacts/a/1-x']);
      expect(await storage.deleteIncompleteWrites(HOUR_AGO)).toBe(1);
      expect(await listFiles(root)).toEqual(['artifacts/a/1-x', 'artifacts/b/2-z.def.tmp']);
    });
  });

  describe('key validation', () => {
    const invalidKeys = [
      '',
      '../outside',
      'artifacts/../../outside',
      'artifacts/./x',
      '/etc/passwd',
      'artifacts//x',
      'artifacts/x/',
      'artifacts\\..\\outside',
      'x.tmp',
      '.hidden',
      'name with spaces',
      'nul\0byte',
      'a'.repeat(513),
    ];

    it.each(invalidKeys)('rejects %j in every operation', async (key) => {
      await expect(storage.put(key, body('x'), OPTS)).rejects.toBeInstanceOf(InvalidBlobKeyError);
      await expect(storage.getStream(key)).rejects.toBeInstanceOf(InvalidBlobKeyError);
      await expect(storage.stat(key)).rejects.toBeInstanceOf(InvalidBlobKeyError);
      await expect(storage.delete(key)).rejects.toBeInstanceOf(InvalidBlobKeyError);
    });

    it('never touches files outside the root', async () => {
      const outside = path.join(sandbox, 'outside');
      await writeFile(outside, 'keep me');

      await expect(storage.delete('../outside')).rejects.toBeInstanceOf(InvalidBlobKeyError);
      await expect(storage.put('../outside', body('x'), OPTS)).rejects.toBeInstanceOf(
        InvalidBlobKeyError,
      );
      expect(await listFiles(sandbox)).toEqual(['outside']);
    });

    it('accepts the keys the server generates', async () => {
      const key = blobKeys.artifactVersion('5b0c3e5e-8d0a-4c56-9a3b-2f1d7c9e4a10', 3);
      expect(key).toMatch(/^artifacts\/5b0c3e5e-8d0a-4c56-9a3b-2f1d7c9e4a10\/3-[0-9a-f-]{36}$/);
      await storage.put(key, body('v3'), OPTS);
      expect(await storage.stat(key)).toEqual({ size: 2 });
    });
  });
});
