import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { usersRoutes } from './users.js';
import { professionalsRoutes } from './professionals.js';
import { bookingsRoutes } from './bookings.js';

export async function setupRoutes(app: FastifyInstance) {
  app.register(authRoutes, { prefix: '/auth' });
  app.register(usersRoutes, { prefix: '/users' });
  app.register(professionalsRoutes, { prefix: '/professionals' });
  app.register(bookingsRoutes, { prefix: '/bookings' });
}
