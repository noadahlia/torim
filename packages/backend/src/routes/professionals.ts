import { FastifyInstance } from 'fastify';

export async function professionalsRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    // Placeholder - list professionals
    return { message: 'List professionals endpoint' };
  });

  app.get('/:id', async (request, reply) => {
    // Placeholder - get professional detail
    return { message: 'Get professional endpoint' };
  });

  app.get('/:id/availability', async (request, reply) => {
    // Placeholder - get availability
    return { message: 'Get availability endpoint' };
  });
}
