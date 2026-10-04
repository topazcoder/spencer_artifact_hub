import { z } from 'zod';

/**
 * Request header that makes a create request safe to retry: a UUID per form submission. A
 * retry with the same key answers like the first request did, without doing it again.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Response header set on an answer replayed for a repeated `Idempotency-Key`. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

export const idempotencyKeySchema = z.uuid();
