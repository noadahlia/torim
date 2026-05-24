/**
 * TimeZoneService - Handle timezone conversions
 * All database times are UTC
 * Conversions happen at API boundaries
 */

import { zonedTimeToUtc as dfZonedTimeToUtc, utcToZonedTime as dfUtcToZonedTime } from 'date-fns-tz';

export class TimeZoneService {
  /**
   * Convert local time to UTC
   */
  static zonedTimeToUtc(date: Date | string, timezone: string): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dfZonedTimeToUtc(dateObj, timezone);
  }

  /**
   * Convert UTC time to local timezone
   */
  static utcToZonedTime(date: Date | string, timezone: string): Date {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dfUtcToZonedTime(dateObj, timezone);
  }

  /**
   * Format time for display
   */
  static formatTimeLocal(date: Date, timezone: string): string {
    const localDate = this.utcToZonedTime(date, timezone);
    return localDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  /**
   * Get day of week (0 = Monday, 6 = Sunday)
   */
  static getDayOfWeek(date: Date): number {
    const day = date.getDay();
    return day === 0 ? 6 : day - 1;
  }

  /**
   * Check if times overlap
   */
  static timesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 < end2 && end1 > start2;
  }
}
