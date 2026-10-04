const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "yesterday", "3 days ago"; a date after a week. */
export function formatRelativeTime(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), 'minute');
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), 'hour');
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), 'day');
  return absolute.format(then);
}

/** "in 5 minutes", "in 3 hours", "tomorrow", "in 6 days"; "on <date>" after a week. */
export function formatTimeUntil(date: Date | string, now: Date = new Date()): string {
  const then = typeof date === 'string' ? new Date(date) : date;
  const remaining = then.getTime() - now.getTime();
  // Compare rounded values, so 23h59m reads "tomorrow" rather than "in 24 hours".
  const minutes = Math.max(1, Math.ceil(remaining / MINUTE));
  if (minutes < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(remaining / HOUR);
  if (hours < 24) return relative.format(hours, 'hour');
  const days = Math.round(remaining / DAY);
  if (days <= 7) return relative.format(days, 'day');
  return `on ${absolute.format(then)}`;
}

const day = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
const parseDay = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * "Updated Sep 28 – Oct 4, 2026", "Updated since Sep 28, 2026" or "Updated until Oct 4, 2026"
 * for days given as `YYYY-MM-DD` (UTC, as the server filters them). Null without either.
 */
export function formatUpdatedRange(from?: string, to?: string): string | null {
  if (from && to) return `Updated ${day.formatRange(parseDay(from), parseDay(to))}`;
  if (from) return `Updated since ${day.format(parseDay(from))}`;
  if (to) return `Updated until ${day.format(parseDay(to))}`;
  return null;
}
