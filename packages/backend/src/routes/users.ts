import { FastifyInstance } from 'fastify';

export async function usersRoutes(app: FastifyInstance) {
  app.get('/profile', async (request, reply) => {
    // Placeholder - to be implemented
    return { message: 'Get profile endpoint' };
  });

  app.put('/profile', async (request, reply) => {
    // Placeholder - to be implemented
    return { message: 'Update profile endpoint' };
  });
}
