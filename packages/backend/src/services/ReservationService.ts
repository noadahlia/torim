import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { BookingEngine } from './BookingEngine.js';
import { TrustService } from './TrustService.js';
import { NotFoundError } from '../utils/errors.js';

export class ReservationService {
  private supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
  private bookingEngine = new BookingEngine();
  private trustService = new TrustService();

  async createReservation(
    clientId: string,
    professionalId: string,
    serviceId: string,
    startUtc: Date,
    endUtc: Date
  ) {
    // Use booking engine to create reservation atomically
    return await this.bookingEngine.createReservation(
      clientId,
      professionalId,
      serviceId,
      startUtc,
      endUtc
    );
  }

  async getReservation(id: string) {
    const { data, error } = await this.supabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Reservation not found');
    }

    return data;
  }

  async getClientReservations(clientId: string) {
    const { data, error } = await this.supabase
      .from('reservations')
      .select('*')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false });

    if (error) {
      throw new Error('Failed to get reservations');
    }

    return data || [];
  }

  async getProfessionalReservations(professionalId: string) {
    const { data, error } = await this.supabase
      .from('reservations')
      .select('*')
      .eq('professional_id', professionalId)
      .order('start_time', { ascending: false });

    if (error) {
      throw new Error('Failed to get reservations');
    }

    return data || [];
  }

  async cancelReservation(reservationId: string, cancelledBy: 'CLIENT' | 'PROFESSIONAL') {
    // Use booking engine for refund calculation
    return await this.bookingEngine.cancelReservation(reservationId, cancelledBy);
  }

  async completeReservation(reservationId: string) {
    const { data: reservation } = await this.getReservation(reservationId);

    const { data, error } = await this.supabase
      .from('reservations')
      .update({
        status: 'COMPLETED',
        completed_at: new Date(),
      })
      .eq('id', reservationId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to complete reservation');
    }

    // Record trust event
    if (reservation) {
      await this.trustService.recordTrustEvent(
        reservation.client_id,
        'booking_completed',
        reservationId
      );
    }

    return data;
  }

  async markNoShow(reservationId: string) {
    const { data: reservation } = await this.getReservation(reservationId);

    const { data, error } = await this.supabase
      .from('reservations')
      .update({
        status: 'NO_SHOW',
      })
      .eq('id', reservationId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to mark no-show');
    }

    // Record trust event
    if (reservation) {
      await this.trustService.recordTrustEvent(
        reservation.client_id,
        'no_show',
        reservationId
      );
    }

    return data;
  }
}
