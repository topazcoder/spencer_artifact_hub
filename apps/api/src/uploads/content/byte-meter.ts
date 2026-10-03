import { ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../../common/errors/app-error.js';

/** Counts bytes and fails as soon as the limit is passed, before the rest is read. */
export class ByteMeter {
  private total = 0;

  constructor(private readonly maxBytes: number) {}

  add(chunk: Buffer | string): Buffer {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this.total += buffer.length;
    if (this.total > this.maxBytes) throw ByteMeter.tooLarge(this.maxBytes);
    return buffer;
  }

  /** The `ARTIFACT_TOO_LARGE` error, also used to reject a too-large `Content-Length` early. */
  static tooLarge(maxBytes: number): AppError {
    return new AppError(
      ErrorCode.ARTIFACT_TOO_LARGE,
      `The file is larger than the ${ByteMeter.describeLimit(maxBytes)} limit.`,
      { maxBytes },
    );
  }

  /** The limit for people: "10 MB", "1.5 MB" or "500 KB". */
  private static describeLimit(maxBytes: number): string {
    const mb = maxBytes / (1024 * 1024);
    if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
    return `${Math.ceil(maxBytes / 1024)} KB`;
  }
}
