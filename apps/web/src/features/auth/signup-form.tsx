import { PASSWORD_MIN_LENGTH, type SignupRequest, signupRequestSchema } from '@artifact-hub/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FormError, TextField } from '@/components/form-fields.tsx';
import { Button } from '@/components/ui/button.tsx';
import { isApiError } from '@/lib/api/api-error.ts';
import { applyServerError } from './apply-server-error.ts';
import type { SignupFormValues } from './auth.types.ts';
import { useSignup } from './use-auth.ts';

export function SignupForm() {
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues, unknown, SignupRequest>({
    resolver: zodResolver(signupRequestSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup.mutateAsync(values);
    } catch (error) {
      if (isApiError(error, 'CONFLICT')) {
        setError('email', { message: error.message }, { shouldFocus: true });
        return;
      }
      applyServerError(error, setError, ['displayName', 'email', 'password']);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Name"
        autoComplete="name"
        autoFocus
        error={errors.displayName?.message}
        {...register('displayName')}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
