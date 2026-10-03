import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Parses a request part with a zod schema; failures become `VALIDATION_FAILED` in the error filter. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    return this.schema.parse(value);
  }
}
