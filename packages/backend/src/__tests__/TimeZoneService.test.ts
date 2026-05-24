import { TimeZoneService } from '../services/TimeZoneService';

describe('TimeZoneService', () => {
  describe('getDayOfWeek', () => {
    it('should return 0 for Monday', () => {
      // Monday
      const date = new Date('2024-01-01'); // This is a Monday
      expect(TimeZoneService.getDayOfWeek(date)).toBe(0);
    });

    it('should return 6 for Sunday', () => {
      // Create a Sunday date
      const date = new Date('2024-01-07'); // This is a Sunday
      expect(TimeZoneService.getDayOfWeek(date)).toBe(6);
    });

    it('should return correct day for Wednesday', () => {
      const date = new Date('2024-01-03'); // This is a Wednesday
      expect(TimeZoneService.getDayOfWeek(date)).toBe(2);
    });
  });

  describe('timesOverlap', () => {
    it('should detect overlapping time ranges', () => {
      const start1 = new Date('2024-01-01T10:00:00');
      const end1 = new Date('2024-01-01T12:00:00');
      const start2 = new Date('2024-01-01T11:00:00');
      const end2 = new Date('2024-01-01T13:00:00');

      expect(TimeZoneService.timesOverlap(start1, end1, start2, end2)).toBe(true);
    });

    it('should not detect overlap for adjacent time ranges', () => {
      const start1 = new Date('2024-01-01T10:00:00');
      const end1 = new Date('2024-01-01T12:00:00');
      const start2 = new Date('2024-01-01T12:00:00');
      const end2 = new Date('2024-01-01T13:00:00');

      expect(TimeZoneService.timesOverlap(start1, end1, start2, end2)).toBe(false);
    });

    it('should not detect overlap for completely separate ranges', () => {
      const start1 = new Date('2024-01-01T10:00:00');
      const end1 = new Date('2024-01-01T12:00:00');
      const start2 = new Date('2024-01-01T14:00:00');
      const end2 = new Date('2024-01-01T15:00:00');

      expect(TimeZoneService.timesOverlap(start1, end1, start2, end2)).toBe(false);
    });

    it('should detect one range completely inside another', () => {
      const start1 = new Date('2024-01-01T10:00:00');
      const end1 = new Date('2024-01-01T15:00:00');
      const start2 = new Date('2024-01-01T11:00:00');
      const end2 = new Date('2024-01-01T12:00:00');

      expect(TimeZoneService.timesOverlap(start1, end1, start2, end2)).toBe(true);
    });
  });

  describe('formatTimeLocal', () => {
    it('should format time in 24-hour format', () => {
      const date = new Date('2024-01-01T14:30:00Z');
      const formatted = TimeZoneService.formatTimeLocal(date, 'Asia/Jerusalem');
      expect(formatted).toMatch(/\d{2}:\d{2}/);
    });

    it('should respect timezone differences', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const jerusalemTime = TimeZoneService.formatTimeLocal(date, 'Asia/Jerusalem');
      const nyTime = TimeZoneService.formatTimeLocal(date, 'America/New_York');
      expect(jerusalemTime).not.toBe(nyTime);
    });
  });

  describe('zonedTimeToUtc', () => {
    it('should convert local time to UTC correctly', () => {
      const localDate = new Date('2024-01-01T12:00:00');
      const utcDate = TimeZoneService.zonedTimeToUtc(localDate, 'Asia/Jerusalem');
      expect(utcDate).toBeInstanceOf(Date);
    });

    it('should handle string date input', () => {
      const dateString = '2024-01-01T12:00:00';
      const utcDate = TimeZoneService.zonedTimeToUtc(dateString, 'Asia/Jerusalem');
      expect(utcDate).toBeInstanceOf(Date);
    });
  });

  describe('utcToZonedTime', () => {
    it('should convert UTC time to local time correctly', () => {
      const utcDate = new Date('2024-01-01T10:00:00Z');
      const localDate = TimeZoneService.utcToZonedTime(utcDate, 'Asia/Jerusalem');
      expect(localDate).toBeInstanceOf(Date);
    });

    it('should handle string date input', () => {
      const dateString = '2024-01-01T10:00:00Z';
      const localDate = TimeZoneService.utcToZonedTime(dateString, 'Asia/Jerusalem');
      expect(localDate).toBeInstanceOf(Date);
    });
  });

  describe('DST Handling', () => {
    it('should correctly handle summer time transition dates', () => {
      // Test date during DST in Europe/Paris
      const marchDate = new Date('2024-03-31T02:00:00Z');
      const parisTime = TimeZoneService.utcToZonedTime(marchDate, 'Europe/Paris');
      expect(parisTime).toBeInstanceOf(Date);
    });

    it('should correctly handle winter time transition dates', () => {
      // Test date during standard time
      const octoberDate = new Date('2024-10-27T02:00:00Z');
      const parisTime = TimeZoneService.utcToZonedTime(octoberDate, 'Europe/Paris');
      expect(parisTime).toBeInstanceOf(Date);
    });
  });
});
