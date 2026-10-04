import { unsupported } from './unsupported-type.js';

/** Validates UTF-8 across chunk boundaries; text formats must be UTF-8 throughout. */
export class Utf8Validator {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });

  write(chunk: Buffer): void {
    this.check(() => this.decoder.decode(chunk, { stream: true }));
    if (chunk.includes(0)) throw unsupported('nul_bytes', 'Text files must not contain NUL bytes.');
  }

  /** Fails if the content ends in the middle of a character. */
  end(): void {
    this.check(() => this.decoder.decode());
  }

  private check(decode: () => string): void {
    try {
      decode();
    } catch {
      throw unsupported('not_utf8', 'Text files must be UTF-8 encoded.');
    }
  }
}
