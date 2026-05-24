import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.string().pipe(z.coerce.number()).default('3000'),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
});

export const config = envSchema.parse(process.env);
