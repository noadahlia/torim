import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyAuth } from '../middleware/auth.js';
import { ReservationService } from '../services/ReservationService.js';
import { TrustService } from '../services/TrustService.js';

const createBookingSchema = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startUtc: z.string().datetime(),
  endUtc: z.string().datetime(),
});

const cancelBookingSchema = z.object({
  reason: z.string().optional(),
});

export async function bookingsRoutes(app: FastifyInstance) {
  const reservationService = new ReservationService();
  const trustService = new TrustService();

  app.post('/', { onRequest: verifyAuth }, async (request: FastifyRequest, reply) => {
    const body = createBookingSchema.parse(request.body);

    await trustService.initializeClientTrustProfile(request.user.id);

    const reservation = await reservationService.createReservation(
      request.user.id,
      body.professionalId,
      body.serviceId,
      new Date(body.startUtc),
      new Date(body.endUtc)
    );

    return reply.status(201).send(reservation);
  });

  app.get('/:id', { onRequest: verifyAuth }, async (request: FastifyRequest) => {
    const { id } = request.params as { id: string };

    const reservation = await reservationService.getReservation(id);

    return reservation;
  });

  app.get('/', { onRequest: verifyAuth }, async (request: FastifyRequest) => {
    const reservations = await reservationService.getClientReservations(request.user.id);

    return reply.send(reservations);
  });

  app.post('/:id/cancel', { onRequest: verifyAuth }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };

    const reservation = await reservationService.cancelReservation(id, 'CLIENT');

    return reply.send(reservation);
  });
}
