import { APP_NAME } from '@artifact-hub/shared';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';

interface AuthLayoutProps {
  title: string;
  description: string;
  children: ReactNode;
  /** The other auth page, e.g. "Don't have an account? Sign up". */
  switchPrompt: string;
  switchLabel: string;
  switchTo: '/login' | '/signup';
}

export function AuthLayout(props: AuthLayoutProps) {
  const [searchParams] = useSearchParams();
  // Keep `?next=` when switching between login and signup.
  const next = searchParams.get('next');
  const switchHref = next ? `${props.switchTo}?next=${encodeURIComponent(next)}` : props.switchTo;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6">
      <p className="text-xl font-semibold tracking-tight">{APP_NAME}</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{props.title}</h1>
          </CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {props.children}
          <p className="text-center text-sm text-muted-foreground">
            {props.switchPrompt}{' '}
            <Link
              to={switchHref}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {props.switchLabel}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
