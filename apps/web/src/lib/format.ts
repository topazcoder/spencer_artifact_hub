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
