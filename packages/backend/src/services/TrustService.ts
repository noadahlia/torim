import { supabase } from '../config/supabase.js';

export class TrustService {
  private supabase = supabase;

  /**
   * Initialize trust profile for new client
   */
  async initializeClientTrustProfile(clientId: string) {
    const { data: existing } = await this.supabase
      .from('client_trust_profiles')
      .select('id')
      .eq('client_id', clientId)
      .single();

    if (!existing) {
      await this.supabase.from('client_trust_profiles').insert({
        client_id: clientId,
        trust_score: 50,
      });
    }
  }

  /**
   * Get current trust score (READ ONLY for Booking Engine)
   */
  async getTrustScore(clientId: string): Promise<number> {
    const { data } = await this.supabase
      .from('client_trust_profiles')
      .select('trust_score')
      .eq('client_id', clientId)
      .single();

    return data?.trust_score ?? 50;
  }

  /**
   * Record trust event
   */
  async recordTrustEvent(
    clientId: string,
    eventType: 'booking_completed' | 'no_show' | 'cancellation_0_24h' | 'cancellation_24h_plus' | 'booking_confirmed',
    reservationId: string
  ) {
    // Map event to points delta
    const pointsDelta: Record<string, number> = {
      booking_completed: 2,
      no_show: -8,
      cancellation_0_24h: -5,
      cancellation_24h_plus: -2,
      booking_confirmed: 1,
    };

    const delta = pointsDelta[eventType];

    // Insert event log
    await this.supabase.from('trust_events').insert({
      client_id: clientId,
      reservation_id: reservationId,
      event_type: eventType,
      points_delta: delta,
    });

    // Update score
    const currentScore = await this.getTrustScore(clientId);
    let newScore = currentScore + delta;
    newScore = Math.max(0, Math.min(100, newScore));

    await this.supabase
      .from('client_trust_profiles')
      .update({
        trust_score: newScore,
        last_updated_at: new Date(),
      })
      .eq('client_id', clientId);
  }

  /**
   * Get full trust profile (admin only)
   */
  async getClientTrustProfile(clientId: string) {
    const { data } = await this.supabase
      .from('client_trust_profiles')
      .select('*')
      .eq('client_id', clientId)
      .single();

    return data;
  }
}
