import { useSyncExternalStore } from 'react';

/**
 * Whether the screen matches a CSS media query, following changes. `fallback` is the answer
 * where the browser can't tell (tests, server rendering).
 */
export function useMediaQuery(query: string, fallback: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia?.(query);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(query).matches ?? fallback,
    () => fallback,
  );
}
