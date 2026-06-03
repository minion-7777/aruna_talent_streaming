import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initDb } from './db.js';
import { redis } from './redis.js';
import {
  healthRoutes,
  hookRoutes,
  internalRoutes,
  streamRoutes,
} from './routes.js';

async function main() {
  await initDb();
  await redis.connect();

  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(healthRoutes);
  await app.register(streamRoutes);
  await app.register(hookRoutes);
  await app.register(internalRoutes);

  const shutdown = async () => {
    app.log.info('Shutting down gracefully…');
    await app.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`API listening on :${config.port} (${config.hostname})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
