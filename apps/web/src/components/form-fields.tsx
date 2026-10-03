import { type ComponentProps, type ReactNode, useId } from 'react';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { NativeSelect } from '@/components/ui/native-select.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
}

/** Ids and ARIA props that tie a control to its hint and error message. */
function useFieldIds(id: string | undefined, { hint, error }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');
  return {
    controlId,
    hintId,
    errorId,
    controlProps: {
      id: controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy || undefined,
    },
  };
}

function Field({
  label,
  hint,
  error,
  ids,
  children,
}: FieldProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={ids.controlId}>{label}</Label>
      {children}
      {error ? (
        <p id={ids.errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={ids.hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A labelled input with an optional hint and an error message wired up for screen readers. */
export function TextField({
  label,
  hint,
  error,
  id,
  ...inputProps
}: FieldProps & ComponentProps<typeof Input>) {
  const ids = useFieldIds(id, { label, hint, error });
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <Input {...ids.controlProps} {...inputProps} />
    </Field>
  );
}

/** `TextField` for multi-line text. */
export function TextAreaField({
  label,
  hint,
  error,
  id,
  ...textareaProps
}: FieldProps & ComponentProps<typeof Textarea>) {
  const ids = useFieldIds(id, { label, hint, error });
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <Textarea {...ids.controlProps} {...textareaProps} />
    </Field>
  );
}

/** `TextField` for a choice from a short list; pass `<option>`s as children. */
export function SelectField({
  label,
  hint,
  error,
  id,
  ...selectProps
}: FieldProps & ComponentProps<typeof NativeSelect>) {
  const ids = useFieldIds(id, { label, hint, error });
  return (
    <Field label={label} hint={hint} error={error} ids={ids}>
      <NativeSelect {...ids.controlProps} {...selectProps} />
    </Field>
  );
}

/** A form-level error (e.g. wrong credentials), announced when it appears. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
