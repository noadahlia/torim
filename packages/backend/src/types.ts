import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    };
  }
}
