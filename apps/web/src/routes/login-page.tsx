import { LoginForm } from '@/features/auth/login-form.tsx';
import { AuthLayout } from './auth-layout.tsx';

export function LoginPage() {
  return (
    <AuthLayout
      title="Log in"
      description="Welcome back. Log in to see and share artifacts."
      switchPrompt="Don't have an account?"
      switchLabel="Sign up"
      switchTo="/signup"
    >
      <LoginForm />
    </AuthLayout>
  );
}
