import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/AuthService.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string(),
  timezone: z.string(),
  role: z.enum(['ROLE_CLIENT', 'ROLE_PROFESSIONAL']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService();

  app.post('/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);

    const result = await authService.signup(
      body.email,
      body.password,
      body.fullName,
      body.timezone,
      body.role || 'ROLE_CLIENT'
    );

    return reply.status(201).send(result);
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const result = await authService.login(body.email, body.password);

    return reply.send(result);
  });

  app.post('/logout', async (request, reply) => {
    reply.send({ message: 'Logged out successfully' });
  });
}
