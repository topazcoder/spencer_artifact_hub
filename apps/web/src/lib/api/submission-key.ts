/** One key per variables object; weak, so finished mutations take theirs with them. */
const keys = new WeakMap<object, string>();

/**
 * The `Idempotency-Key` of one submission: TanStack Query retries a mutation with the same
 * variables object, so every retry sends the same key, and the server does the work once.
 * The next submission (new variables) gets a new key.
 */
export function submissionKey(variables: object): string {
  let key = keys.get(variables);
  if (key === undefined) {
    key = crypto.randomUUID();
    keys.set(variables, key);
  }
  return key;
}
