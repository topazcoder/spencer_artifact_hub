/** Thrown by drivers for keys that do not exist. A version row without its blob is a server fault. */
export class BlobNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Blob not found: ${key}`);
    this.name = 'BlobNotFoundError';
  }
}

/** Thrown for keys that are malformed or would resolve outside the storage root. */
export class InvalidBlobKeyError extends Error {
  constructor(readonly key: string) {
    super(`Invalid blob key: ${JSON.stringify(key)}`);
    this.name = 'InvalidBlobKeyError';
  }
}

/** Thrown by `put` when the body length differs from `PutOptions.size`. */
export class BlobSizeMismatchError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Expected ${expected} bytes, received ${actual}`);
    this.name = 'BlobSizeMismatchError';
  }
}
