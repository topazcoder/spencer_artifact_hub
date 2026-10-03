import { ErrorCode } from '@artifact-hub/shared';
import { AppError } from '../../common/errors/app-error.js';

/** Counts bytes and fails as soon as the limit is passed, before the rest is read. */
export class ByteMeter {
  private total = 0;

  constructor(private readonly maxBytes: number) {}

  add(chunk: Buffer | string): Buffer {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    this.total += buffer.length;
    if (this.total > this.maxBytes) {
      throw new AppError(
        ErrorCode.ARTIFACT_TOO_LARGE,
        `The file is larger than the ${this.describeLimit()} limit.`,
        { maxBytes: this.maxBytes },
      );
    }
    return buffer;
  }

  /** The limit for people: "10 MB", "1.5 MB" or "500 KB". */
  private describeLimit(): string {
    const mb = this.maxBytes / (1024 * 1024);
    if (mb >= 1) return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
    return `${Math.ceil(this.maxBytes / 1024)} KB`;
  }
}
