import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.API_PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: [
    process.env.FRONTEND_URL_DEV || 'http://localhost:19000',
    process.env.FRONTEND_URL_PROD || 'https://torim.com',
  ],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });
  next();
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// API ROUTES (TO BE IMPLEMENTED)
// ============================================================================

// Auth routes
app.post('/api/auth/signup', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

app.post('/api/auth/login', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// Professionals
app.get('/api/professionals', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

app.get('/api/professionals/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// Services
app.get('/api/services', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// Availability (CRITICAL)
app.get('/api/availability', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// Reservations (CRITICAL)
app.post('/api/reservations', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

app.get('/api/reservations', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

app.cancel('/api/reservations/:id', (req, res) => {
  res.status(501).json({ error: 'Not implemented yet' });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ Database connected');

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
