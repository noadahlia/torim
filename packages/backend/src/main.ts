import './types.js';
import Fastify from 'fastify';
import { config } from './config/env.js';
import { setupRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Register middleware
app.register(errorHandler);

// Register routes
app.register(setupRoutes, { prefix: '/api/v1' });

// Health check
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.API_PORT || '3000', 10);
    const host = process.env.API_HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
