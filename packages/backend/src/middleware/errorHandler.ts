import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors.js';

export async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    // Zod validation errors
    if (error.code === 'FST_ERR_VALIDATION') {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.validation,
        },
      });
    }

    // Default error
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });
}
