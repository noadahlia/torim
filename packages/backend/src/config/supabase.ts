import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  realtime: {
    transport: 'websockets' as const,
  } as any,
});
