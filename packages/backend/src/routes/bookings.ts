import { FastifyInstance } from 'fastify';

export async function bookingsRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    // Placeholder - create booking
    return { message: 'Create booking endpoint' };
  });

  app.get('/:id', async (request, reply) => {
    // Placeholder - get booking detail
    return { message: 'Get booking endpoint' };
  });

  app.post('/:id/cancel', async (request, reply) => {
    // Placeholder - cancel booking
    return { message: 'Cancel booking endpoint' };
  });
}
