import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { describeError, isApiError } from '@/lib/api/api-error.ts';

/**
 * Shows a failed submission on the form: validation issues next to their fields, everything
 * else as a form-level message (`errors.root.server`).
 */
export function applyServerError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  if (isApiError(error)) {
    const issues = error.fieldIssues.filter((issue) => fields.includes(issue.path as Path<T>));
    for (const issue of issues) setError(issue.path as Path<T>, { message: issue.message });
    if (issues.length > 0) return;
  }
  setError('root.server', { message: describeError(error) });
}
