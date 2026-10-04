import { createApiTokenRequestSchema } from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { FormError, TextField } from '@/components/form-fields.tsx';
import { Button } from '@/components/ui/button.tsx';
import { applyServerError } from '@/lib/forms/apply-server-error.ts';
import type { CreateTokenFormValues } from './api-tokens.types.ts';
import { useCreateApiToken } from './use-api-tokens.ts';

/** Names and creates a token; hands the secret to `onCreated`, the only time it is available. */
export function CreateTokenForm({ onCreated }: { onCreated: (secret: string) => void }) {
  const create = useCreateApiToken();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateTokenFormValues>({
    resolver: zodResolver(createApiTokenRequestSchema),
    defaultValues: { name: '' },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const { secret } = await create.mutateAsync(values);
      reset({ name: '' });
      onCreated(secret);
    } catch (error) {
      applyServerError(error, setError, ['name']);
    }
  });

  return (
    <form noValidate className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <FormError message={errors.root?.server?.message} />
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-60">
          <TextField
            label="Token name"
            hint="Where you'll use it, e.g. “Claude Desktop on my laptop”."
            error={errors.name?.message}
            autoComplete="off"
            {...register('name')}
          />
        </div>
        <Button type="submit" className="mt-[1.375rem]" disabled={isSubmitting}>
          <PlusIcon aria-hidden="true" />
          Create token
        </Button>
      </div>
    </form>
  );
}
