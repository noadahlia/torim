/**
 * Timezone utilities
 * All times are stored in UTC in the database
 * Conversion to local timezone happens at API boundaries
 */

export const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

/**
 * Convert local time to UTC
 * Note: This is a placeholder - use date-fns-tz in actual implementation
 */
export function zonedTimeToUtc(date: Date, timezone: string): Date {
  // Placeholder - to be implemented with date-fns-tz
  return date;
}

/**
 * Convert UTC time to local timezone
 * Note: This is a placeholder - use date-fns-tz in actual implementation
 */
export function utcToZonedTime(date: Date, timezone: string): Date {
  // Placeholder - to be implemented with date-fns-tz
  return date;
}

/**
 * Format time for display in local timezone
 */
export function formatTimeLocal(date: Date, timezone: string): string {
  const localDate = utcToZonedTime(date, timezone);
  return localDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get day of week (0 = Monday, 6 = Sunday)
 */
export function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1; // Convert JS day (0=Sunday) to our convention (0=Monday)
}
