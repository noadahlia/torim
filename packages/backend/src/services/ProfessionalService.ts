import { supabase } from '../config/supabase.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export class ProfessionalService {
  private supabase = supabase;

  async getProfessional(id: string) {
    const { data, error } = await this.supabase
      .from('professional_profiles')
      .select('*')
      .eq('user_id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Professional not found');
    }

    return data;
  }

  async listProfessionals(limit = 20, offset = 0) {
    const { data, error } = await this.supabase
      .from('professional_profiles')
      .select('*')
      .limit(limit)
      .offset(offset);

    if (error) {
      throw new Error('Failed to list professionals');
    }

    return data || [];
  }

  async getServices(professionalId: string) {
    const { data, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('user_id', professionalId)
      .eq('is_active', true);

    if (error) {
      throw new Error('Failed to get services');
    }

    return data || [];
  }

  async getSchedule(professionalId: string) {
    const { data, error } = await this.supabase
      .from('professional_schedules')
      .select('*')
      .eq('user_id', professionalId)
      .eq('is_available', true);

    if (error) {
      throw new Error('Failed to get schedule');
    }

    return data || [];
  }

  async updateProfile(userId: string, updates: any) {
    const { data, error } = await this.supabase
      .from('professional_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update profile');
    }

    return data;
  }
}
