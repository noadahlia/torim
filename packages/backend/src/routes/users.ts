import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyAuth } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { NotFoundError } from '../utils/errors.js';

const updateProfileSchema = z.object({
  fullName: z.string().optional(),
  timezone: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

export async function usersRoutes(app: FastifyInstance) {

  app.get('/profile', { onRequest: verifyAuth }, async (request: FastifyRequest) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', request.user.id)
      .single();

    if (error || !data) {
      throw new NotFoundError('User profile not found');
    }

    return data;
  });

  app.put('/profile', { onRequest: verifyAuth }, async (request: FastifyRequest) => {
    const body = updateProfileSchema.parse(request.body);

    const { data, error } = await supabase
      .from('users')
      .update(body)
      .eq('id', request.user.id)
      .select()
      .single();

    if (error || !data) {
      throw new Error('Failed to update profile');
    }

    return data;
  });
}
