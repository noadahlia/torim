import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { AuthenticationError } from '../utils/errors.js';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

export async function verifyAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthenticationError('Invalid or expired token');
  }

  request.user = user;
}
