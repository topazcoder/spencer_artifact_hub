import type { ShareLink } from '@artifact-hub/shared';
import { formatTimeUntil } from '@/lib/format.ts';

/** Expiry choices for a link, in days (`never` = no expiry). */
export const EXPIRY_PRESETS = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'never', label: 'Never' },
] as const;

export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]['value'];

/** A new link expires after a week unless the owner chooses otherwise. */
export const DEFAULT_EXPIRY: ExpiryPreset = '7';

/** The `expiresAt` for a preset, counted from `now`. */
export function expiresAtFor(preset: ExpiryPreset, now: Date = new Date()): string | null {
  if (preset === 'never') return null;
  return new Date(now.getTime() + Number(preset) * 24 * 60 * 60_000).toISOString();
}

/** "Expires tomorrow", "Never expires", "Expired". */
export function expiryLabel(link: ShareLink, now: Date = new Date()): string {
  if (link.expiresAt === null) return 'Never expires';
  if (new Date(link.expiresAt) <= now) return 'Expired';
  return `Expires ${formatTimeUntil(link.expiresAt, now)}`;
}
