import { SignupForm } from '@/features/auth/signup-form.tsx';
import { AuthLayout } from './auth-layout.tsx';

export function SignupPage() {
  return (
    <AuthLayout
      title="Create an account"
      description="Publish, review and share AI-generated artifacts with your team."
      switchPrompt="Already have an account?"
      switchLabel="Log in"
      switchTo="/login"
    >
      <SignupForm />
    </AuthLayout>
  );
}
