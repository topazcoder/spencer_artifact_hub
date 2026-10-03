import { createCommentRequestSchema } from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormError } from '@/components/form-fields.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { applyServerError } from '@/lib/forms/apply-server-error.ts';
import type { CommentFormValues } from './comments.types.ts';

const commentFormSchema = createCommentRequestSchema.pick({ body: true });

/**
 * A comment box for a new comment, a reply or an edit. Ctrl/⌘+Enter submits. Cleared after a
 * successful submit; server errors are shown under it.
 */
export function CommentForm({
  label,
  placeholder,
  submitLabel,
  defaultBody = '',
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  /** Accessible name of the text box. */
  label: string;
  placeholder?: string;
  submitLabel: string;
  defaultBody?: string;
  autoFocus?: boolean;
  /** Rejects with the API error to show it. */
  onSubmit: (body: string) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const errorId = useId();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { body: defaultBody },
  });

  const submit = handleSubmit(async ({ body }) => {
    try {
      await onSubmit(body);
      reset({ body: '' });
    } catch (error) {
      applyServerError(error, setError, ['body']);
    }
  });
  const blank = useWatch({ control, name: 'body' }).trim() === '';
  const error = errors.body?.message;

  return (
    <form noValidate className="grid gap-2" onSubmit={(event) => void submit(event)}>
      <FormError message={errors.root?.server?.message} />
      <Textarea
        aria-label={label}
        placeholder={placeholder}
        rows={2}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="max-h-60"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
        }}
        {...register('body')}
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={isSubmitting || blank}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
