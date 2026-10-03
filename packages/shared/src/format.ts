const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/**
 * A byte count for people, in 1024-based units: "512 B", "1.5 KB", "10 MB". One decimal below
 * 10 of a unit (dropped when it is .0), whole numbers above.
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${UNITS[unit]}`;
}
