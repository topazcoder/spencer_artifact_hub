import { ErrorCode } from '@artifact-hub/shared';
import { Utf8Validator } from './utf8-validator.js';

const unsupportedType = expect.objectContaining({ code: ErrorCode.UNSUPPORTED_TYPE });

describe('Utf8Validator', () => {
  it('accepts multi-byte characters split across chunks', () => {
    const validator = new Utf8Validator();
    const bytes = Buffer.from('✓𝄞');
    for (const byte of bytes) validator.write(Buffer.from([byte]));
    expect(() => validator.end()).not.toThrow();
  });

  it('rejects invalid byte sequences', () => {
    expect(() => new Utf8Validator().write(Buffer.from([0x61, 0xc3, 0x28]))).toThrow(
      unsupportedType,
    );
  });

  it('rejects content that ends in the middle of a character', () => {
    const validator = new Utf8Validator();
    validator.write(Buffer.from([0xe2, 0x9c]));
    expect(() => validator.end()).toThrow(unsupportedType);
  });

  it('rejects NUL bytes', () => {
    expect(() => new Utf8Validator().write(Buffer.from('a\0b'))).toThrow(/NUL/);
  });
});
