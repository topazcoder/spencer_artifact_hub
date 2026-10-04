/** A request made safe to repeat with an `Idempotency-Key` (`IdempotencyService.run`). */
export interface IdempotentOperation<T> {
  /** Does the work, and says which resource the answer is about. */
  execute(): Promise<IdempotentResult<T>>;
  /** The answer for a repeat: the resource as it is now. */
  replay(resourceId: string): Promise<T>;
  /** What was sent, as a hash (`requestFingerprint`). A repeat must send the same. */
  fingerprint: string;
  /** On a repeat, before it is answered: e.g. drains the unread file of an upload. */
  skip?(): Promise<void>;
}

export interface IdempotentResult<T> {
  result: T;
  resourceId: string;
}
