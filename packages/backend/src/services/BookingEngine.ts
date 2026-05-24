/**
 * BookingEngine - Core reservation logic
 * CRITICAL: Implements atomic, race-condition safe booking
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { TimeZoneService } from './TimeZoneService.js';
import { TrustService } from './TrustService.js';
import { ConflictError, ValidationError, NotFoundError } from '../utils/errors.js';

export class BookingEngine {
  private supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  private trustService = new TrustService();

  /**
   * Calculate available time slots for a professional
   */
  async calculateAvailability(
    professionalId: string,
    date: string, // YYYY-MM-DD in client's timezone
    serviceId: string,
    clientTz: string,
    proTz: string
  ) {
    // 1. Get professional's schedule for this day of week
    const dayOfWeek = TimeZoneService.getDayOfWeek(new Date(date));

    const { data: schedule } = await this.supabase
      .from('professional_schedules')
      .select('*')
      .eq('user_id', professionalId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true)
      .single();

    if (!schedule) {
      return []; // Pro doesn't work this day
    }

    // 2. Convert pro's schedule to UTC
    const proScheduleStartLocal = new Date(`${date}T${schedule.start_time}`);
    const proScheduleEndLocal = new Date(`${date}T${schedule.end_time}`);

    const proScheduleStartUtc = TimeZoneService.zonedTimeToUtc(proScheduleStartLocal, proTz);
    const proScheduleEndUtc = TimeZoneService.zonedTimeToUtc(proScheduleEndLocal, proTz);

    // 3. Get service duration
    const { data: service } = await this.supabase
      .from('services')
      .select('duration_minutes, buffer_minutes_after')
      .eq('id', serviceId)
      .single();

    if (!service) {
      throw new NotFoundError('Service not found');
    }

    const serviceDurationMs = service.duration_minutes * 60 * 1000;
    const bufferMs = (service.buffer_minutes_after || 15) * 60 * 1000;

    // 4. Get existing reservations (non-cancelled)
    const { data: existing } = await this.supabase
      .from('reservations')
      .select('start_time, end_time')
      .eq('professional_id', professionalId)
      .gte('start_time', proScheduleStartUtc.toISOString())
      .lte('end_time', proScheduleEndUtc.toISOString())
      .in('status', ['CONFIRMED', 'AWAITING_CONFIRMATION', 'AWAITING_DEPOSIT']);

    // 5. Build available slots (15-minute granularity)
    const slots = [];
    const GRANULARITY_MS = 15 * 60 * 1000;
    let current = proScheduleStartUtc.getTime();

    while (current + serviceDurationMs <= proScheduleEndUtc.getTime()) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current + serviceDurationMs);
      const slotEndWithBuffer = new Date(current + serviceDurationMs + bufferMs);

      // Check overlap with existing reservations
      let hasOverlap = false;
      if (existing) {
        for (const ex of existing) {
          const exStart = new Date(ex.start_time).getTime();
          const exEnd = new Date(ex.end_time).getTime();

          if (
            slotStart.getTime() < exEnd + bufferMs &&
            slotEnd.getTime() > exStart
          ) {
            hasOverlap = true;
            break;
          }
        }
      }

      // Check buffer doesn't overflow past pro schedule
      if (!hasOverlap && slotEndWithBuffer.getTime() <= proScheduleEndUtc.getTime()) {
        const displayLocal = TimeZoneService.formatTimeLocal(slotStart, clientTz);
        slots.push({
          start_utc: slotStart.toISOString(),
          end_utc: slotEnd.toISOString(),
          display_local: displayLocal,
        });
      }

      current += GRANULARITY_MS;
    }

    return slots;
  }

  /**
   * Create reservation atomically
   */
  async createReservation(
    clientId: string,
    professionalId: string,
    serviceId: string,
    startUtc: Date,
    endUtc: Date
  ) {
    // 1. Validate preconditions
    if (clientId === professionalId) {
      throw new ValidationError('Cannot book yourself');
    }

    const { data: service, error: serviceError } = await this.supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (serviceError || !service) {
      throw new NotFoundError('Service not found');
    }

    // 2. Get professional's acceptance policy
    const { data: profile } = await this.supabase
      .from('professional_profiles')
      .select('acceptance_policy')
      .eq('user_id', professionalId)
      .single();

    const policy = profile?.acceptance_policy || 'OPEN';

    // 3. Get client's trust score
    const trustScore = await this.trustService.getTrustScore(clientId);

    // 4. Evaluate policy
    const { finalStatus, requiresPayment } = this.evaluatePolicy(policy, trustScore);

    if (finalStatus === 'SILENT_REJECTION') {
      throw new ConflictError('Professional unavailable at this time');
    }

    // 5. Create reservation atomically
    const { data: reservation, error } = await this.supabase
      .from('reservations')
      .insert({
        client_id: clientId,
        professional_id: professionalId,
        service_id: serviceId,
        start_time: startUtc.toISOString(),
        end_time: endUtc.toISOString(),
        status: finalStatus,
        service_name_snapshot: service.name,
        service_duration_minutes_snapshot: service.duration_minutes,
        service_price_cents_snapshot: service.price_cents,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation (double-booking)
        throw new ConflictError('This time slot is no longer available');
      }
      throw new Error('Failed to create reservation');
    }

    // 6. Create payment if needed
    if (requiresPayment && finalStatus === 'AWAITING_DEPOSIT') {
      await this.supabase.from('payments').insert({
        reservation_id: reservation.id,
        amount_cents: service.price_cents,
        currency: 'ILS',
        status: 'PENDING',
      });
    }

    // 7. Create audit log
    await this.supabase.from('audit_logs').insert({
      entity_type: 'Reservation',
      entity_id: reservation.id,
      action: 'CREATE',
      user_id: clientId,
      description: `Reservation created, status=${finalStatus}`,
    });

    return reservation;
  }

  /**
   * Cancel reservation
   */
  async cancelReservation(
    reservationId: string,
    cancelledBy: 'CLIENT' | 'PROFESSIONAL'
  ) {
    const { data: reservation } = await this.supabase
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    // Get professional's cancellation policy
    const { data: profile } = await this.supabase
      .from('professional_profiles')
      .select('cancellation_policy')
      .eq('user_id', reservation.professional_id)
      .single();

    const refundPercentage = this.calculateRefundPercentage(
      profile?.cancellation_policy || 'standard',
      new Date(reservation.start_time),
      cancelledBy
    );

    const refundAmount = Math.floor(
      (reservation.service_price_cents_snapshot * refundPercentage) / 100
    );

    // Update reservation
    const { data: updated } = await this.supabase
      .from('reservations')
      .update({
        status: cancelledBy === 'CLIENT' ? 'CANCELLED_BY_CLIENT' : 'CANCELLED_BY_PROFESSIONAL',
        cancelled_at: new Date(),
      })
      .eq('id', reservationId)
      .select()
      .single();

    // Record trust event if client cancelled
    if (cancelledBy === 'CLIENT') {
      const hoursBefore =
        (new Date(reservation.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
      const eventType = hoursBefore > 24 ? 'cancellation_24h_plus' : 'cancellation_0_24h';

      await this.trustService.recordTrustEvent(
        reservation.client_id,
        eventType,
        reservationId
      );
    }

    return updated;
  }

  /**
   * Helper: Evaluate acceptance policy
   */
  private evaluatePolicy(
    policy: string,
    trustScore: number
  ): { finalStatus: string; requiresPayment: boolean } {
    switch (policy) {
      case 'OPEN':
        return { finalStatus: 'CONFIRMED', requiresPayment: false };

      case 'FILTER_LOW_TRUST':
        if (trustScore >= 70) {
          return { finalStatus: 'CONFIRMED', requiresPayment: false };
        } else {
          return { finalStatus: 'SILENT_REJECTION', requiresPayment: false };
        }

      case 'REQUIRE_MANUAL_CONFIRMATION':
        return { finalStatus: 'AWAITING_CONFIRMATION', requiresPayment: false };

      case 'REQUIRE_DEPOSIT_FOR_LOW_TRUST':
        if (trustScore >= 70) {
          return { finalStatus: 'CONFIRMED', requiresPayment: false };
        } else {
          return { finalStatus: 'AWAITING_DEPOSIT', requiresPayment: true };
        }

      default:
        return { finalStatus: 'CONFIRMED', requiresPayment: false };
    }
  }

  /**
   * Helper: Calculate refund percentage
   */
  private calculateRefundPercentage(
    policy: string,
    startTime: Date,
    cancelledBy: string
  ): number {
    const now = new Date();
    const hoursBefore = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (cancelledBy === 'PROFESSIONAL') return 100; // Pro always refunds 100%

    switch (policy) {
      case 'standard':
        if (hoursBefore > 24) return 100;
        if (hoursBefore > 2) return 80;
        return 0;
      case 'flexible':
        return 100;
      case 'strict':
        return 0;
      default:
        return 100;
    }
  }
}
