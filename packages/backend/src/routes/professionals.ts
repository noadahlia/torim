import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProfessionalService } from '../services/ProfessionalService.js';
import { BookingEngine } from '../services/BookingEngine.js';

const listSchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid(),
  clientTz: z.string(),
});

export async function professionalsRoutes(app: FastifyInstance) {
  const professionalService = new ProfessionalService();
  const bookingEngine = new BookingEngine();

  app.get('/', async (request, reply) => {
    const query = listSchema.parse(request.query);

    const professionals = await professionalService.listProfessionals(query.limit, query.offset);

    return reply.send({
      data: professionals,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const professional = await professionalService.getProfessional(id);
    const services = await professionalService.getServices(id);

    return reply.send({
      ...professional,
      services,
    });
  });

  app.get('/:id/availability', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = availabilitySchema.parse(request.query);

    const professional = await professionalService.getProfessional(id);

    const slots = await bookingEngine.calculateAvailability(
      id,
      query.date,
      query.serviceId,
      query.clientTz,
      professional.timezone
    );

    return reply.send({
      professional_id: id,
      date: query.date,
      slots,
    });
  });
}
