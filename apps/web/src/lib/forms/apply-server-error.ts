import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { describeError, isApiError } from '@/lib/api/api-error.ts';

/**
 * Shows a failed submission on the form: validation issues next to their fields, everything
 * else as a form-level message (`errors.root.server`). An issue on a nested path (`tags.0`)
 * goes to the field it belongs to (`tags`).
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  if (isApiError(error)) {
    let applied = false;
    for (const issue of error.fieldIssues) {
      const field = fields.find((f) => issue.path === f || issue.path.startsWith(`${f}.`));
      if (!field) continue;
      setError(field, { message: issue.message });
      applied = true;
    }
    if (applied) return;
  }
  setError('root.server', { message: describeError(error) });
}
