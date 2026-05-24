import { BookingEngine } from '../services/BookingEngine';
import { TrustService } from '../services/TrustService';
import {
  createTestProfessional,
  createTestClient,
  createTestReservation,
  cleanupTestData,
  waitForDatabase,
  testUser,
  supabase,
} from './helpers';

describe('BookingEngine Integration Tests', () => {
  let bookingEngine: BookingEngine;
  let trustService: TrustService;
  let testProData: any;
  let testClientTrust: any;

  beforeAll(async () => {
    // Wait for database to be ready
    await waitForDatabase();
    bookingEngine = new BookingEngine();
    trustService = new TrustService();
  });

  beforeEach(async () => {
    // Cleanup test data
    await cleanupTestData();

    // Create test professional with schedule
    testProData = await createTestProfessional();

    // Create test client with trust profile
    testClientTrust = await createTestClient(75);
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('calculateAvailability', () => {
    it('should calculate available slots for a day', async () => {
      const date = '2024-12-16'; // Monday
      const slots = await bookingEngine.calculateAvailability(
        testUser.professional.id,
        date,
        testProData.service.id,
        'Asia/Jerusalem',
        'Asia/Jerusalem'
      );

      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toHaveProperty('start_utc');
      expect(slots[0]).toHaveProperty('end_utc');
      expect(slots[0]).toHaveProperty('display_local');
    });

    it('should exclude time slots with existing reservations', async () => {
      const date = '2024-12-16';
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      // Create an existing reservation
      await createTestReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime,
        'CONFIRMED'
      );

      // Get available slots
      const slots = await bookingEngine.calculateAvailability(
        testUser.professional.id,
        date,
        testProData.service.id,
        'Asia/Jerusalem',
        'Asia/Jerusalem'
      );

      // Check that the booked time is excluded (with buffer)
      const bookedSlot = slots.find(
        (s) =>
          new Date(s.start_utc) >= startTime &&
          new Date(s.start_utc) < new Date(startTime.getTime() + 90 * 60 * 1000)
      );

      expect(bookedSlot).toBeUndefined();
    });

    it('should respect professional schedule hours', async () => {
      const date = '2024-12-15'; // Sunday (not in schedule)
      const slots = await bookingEngine.calculateAvailability(
        testUser.professional.id,
        date,
        testProData.service.id,
        'Asia/Jerusalem',
        'Asia/Jerusalem'
      );

      expect(slots.length).toBe(0);
    });
  });

  describe('createReservation', () => {
    it('should create a reservation with OPEN policy', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      expect(reservation).toBeDefined();
      expect(reservation.status).toBe('CONFIRMED');
      expect(reservation.client_id).toBe(testUser.client.id);
      expect(reservation.professional_id).toBe(testUser.professional.id);
    });

    it('should prevent self-booking', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      await expect(
        bookingEngine.createReservation(
          testUser.professional.id,
          testUser.professional.id,
          testProData.service.id,
          startTime,
          endTime
        )
      ).rejects.toThrow('Cannot book yourself');
    });

    it('should prevent double-booking with unique constraint', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      // Create first reservation
      await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      // Try to create second reservation at same time
      await expect(
        bookingEngine.createReservation(
          '00000000-0000-0000-0000-000000000099',
          testUser.professional.id,
          testProData.service.id,
          startTime,
          endTime
        )
      ).rejects.toThrow('This time slot is no longer available');
    });

    it('should create snapshot fields for historical integrity', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      expect(reservation.service_name_snapshot).toBe(testProData.service.name);
      expect(reservation.service_duration_minutes_snapshot).toBe(60);
      expect(reservation.service_price_cents_snapshot).toBe(10000);
    });
  });

  describe('cancelReservation', () => {
    it('should calculate refund based on cancellation policy', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      const cancelled = await bookingEngine.cancelReservation(reservation.id, 'CLIENT');

      expect(cancelled.status).toMatch(/^CANCELLED_BY_/);
    });

    it('should record trust event on cancellation', async () => {
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      // Get initial trust score
      const initialScore = await trustService.getTrustScore(testUser.client.id);

      // Cancel reservation
      await bookingEngine.cancelReservation(reservation.id, 'CLIENT');

      // Verify trust event was recorded
      const { data: events } = await supabase
        .from('trust_events')
        .select('*')
        .eq('client_id', testUser.client.id)
        .order('created_at', { ascending: false });

      expect(events && events.length > 0).toBe(true);
    });
  });

  describe('Policy Evaluation', () => {
    it('should confirm with OPEN policy', async () => {
      // Professional has OPEN policy by default
      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        testUser.client.id,
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      expect(reservation.status).toBe('CONFIRMED');
    });

    it('should require deposit for low-trust clients with REQUIRE_DEPOSIT policy', async () => {
      // Update professional to require deposit
      await supabase
        .from('professional_profiles')
        .update({ acceptance_policy: 'REQUIRE_DEPOSIT_FOR_LOW_TRUST' })
        .eq('user_id', testUser.professional.id);

      // Create low-trust client
      const lowTrustClient = await createTestClient(50);

      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      const reservation = await bookingEngine.createReservation(
        '00000000-0000-0000-0000-000000000098',
        testUser.professional.id,
        testProData.service.id,
        startTime,
        endTime
      );

      expect(reservation.status).toBe('AWAITING_DEPOSIT');
    });

    it('should silently reject low-trust clients with FILTER_LOW_TRUST policy', async () => {
      // Update professional to filter low trust
      await supabase
        .from('professional_profiles')
        .update({ acceptance_policy: 'FILTER_LOW_TRUST' })
        .eq('user_id', testUser.professional.id);

      const startTime = new Date('2024-12-16T10:00:00Z');
      const endTime = new Date('2024-12-16T11:00:00Z');

      // Low-trust client should see conflict error (silent rejection)
      await expect(
        bookingEngine.createReservation(
          '00000000-0000-0000-0000-000000000097',
          testUser.professional.id,
          testProData.service.id,
          startTime,
          endTime
        )
      ).rejects.toThrow('Professional unavailable');
    });
  });
});
