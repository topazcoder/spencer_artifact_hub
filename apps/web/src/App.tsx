import { APP_NAME } from '@artifact-hub/shared';

export function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
    </main>
  );
}
