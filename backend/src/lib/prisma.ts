import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Log database events in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug({
      query: e.query,
      duration: `${e.duration}ms`,
    });
  });

  prisma.$on('error', (e) => {
    logger.error('Prisma error:', e);
  });
}

export default prisma;
