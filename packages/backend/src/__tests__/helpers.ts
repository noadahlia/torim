import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Test data fixtures
 */
export const testUser = {
  client: {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'client@test.com',
    password: 'TestPassword123',
    fullName: 'Test Client',
    timezone: 'Asia/Jerusalem',
  },
  professional: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'pro@test.com',
    password: 'ProPassword123',
    fullName: 'Test Professional',
    timezone: 'Asia/Jerusalem',
  },
};

export const testService = {
  id: '00000000-0000-0000-0000-000000000003',
  name: 'Test Service',
  duration_minutes: 60,
  price_cents: 10000,
  buffer_minutes_after: 15,
};

/**
 * Helper: Create test professional with schedule and services
 */
export async function createTestProfessional(overrides = {}) {
  const prof = { ...testUser.professional, ...overrides };

  // Create professional profile
  const { data: profile, error: profileError } = await supabase
    .from('professional_profiles')
    .insert({
      user_id: prof.id,
      bio: 'Test professional',
      acceptance_policy: 'OPEN',
      cancellation_policy: 'standard',
    })
    .select()
    .single();

  if (profileError) throw profileError;

  // Create weekly schedule (Monday-Friday 9-17)
  const { error: scheduleError } = await supabase.from('professional_schedules').insert([
    {
      user_id: prof.id,
      day_of_week: 0, // Monday
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_available: true,
    },
    {
      user_id: prof.id,
      day_of_week: 1, // Tuesday
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_available: true,
    },
    {
      user_id: prof.id,
      day_of_week: 2, // Wednesday
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_available: true,
    },
    {
      user_id: prof.id,
      day_of_week: 3, // Thursday
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_available: true,
    },
    {
      user_id: prof.id,
      day_of_week: 4, // Friday
      start_time: '09:00:00',
      end_time: '17:00:00',
      is_available: true,
    },
  ]);

  if (scheduleError) throw scheduleError;

  // Create service
  const { data: service, error: serviceError } = await supabase
    .from('services')
    .insert({
      user_id: prof.id,
      ...testService,
    })
    .select()
    .single();

  if (serviceError) throw serviceError;

  return { profile, service };
}

/**
 * Helper: Create test client with trust profile
 */
export async function createTestClient(trustScore = 50, overrides = {}) {
  const client = { ...testUser.client, ...overrides };

  // Create trust profile
  const { data: trustProfile, error: trustError } = await supabase
    .from('client_trust_profiles')
    .insert({
      client_id: client.id,
      trust_score: trustScore,
    })
    .select()
    .single();

  if (trustError) throw trustError;

  return trustProfile;
}

/**
 * Helper: Create test reservation
 */
export async function createTestReservation(
  clientId: string,
  professionalId: string,
  serviceId: string,
  startTime: Date,
  endTime: Date,
  status = 'CONFIRMED'
) {
  const { data: service } = await supabase
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single();

  const { data: reservation, error } = await supabase
    .from('reservations')
    .insert({
      client_id: clientId,
      professional_id: professionalId,
      service_id: serviceId,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      status,
      service_name_snapshot: service.name,
      service_duration_minutes_snapshot: service.duration_minutes,
      service_price_cents_snapshot: service.price_cents,
    })
    .select()
    .single();

  if (error) throw error;

  return reservation;
}

/**
 * Helper: Clean up test data
 */
export async function cleanupTestData() {
  // Delete in order of dependencies
  await supabase.from('trust_events').delete().neq('id', '');
  await supabase.from('audit_logs').delete().neq('id', '');
  await supabase.from('payments').delete().neq('id', '');
  await supabase.from('reservations').delete().neq('id', '');
  await supabase.from('client_trust_profiles').delete().neq('id', '');
  await supabase.from('services').delete().neq('id', '');
  await supabase.from('professional_schedules').delete().neq('id', '');
  await supabase.from('professional_profiles').delete().neq('id', '');
}

/**
 * Helper: Wait for database to be ready
 */
export async function waitForDatabase(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { error } = await supabase.from('professional_profiles').select('COUNT(*)').limit(1);
      if (!error) {
        return true;
      }
    } catch (err) {
      // Continue trying
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Database is not responding after 30 seconds');
}
