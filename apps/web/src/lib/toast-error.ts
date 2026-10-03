import { toast } from 'sonner';
import { describeError } from '@/lib/api/api-error.ts';

/** Shows a failed action as a toast, for changes made outside a form. */
export function toastError(error: unknown): void {
  toast.error(describeError(error));
}
