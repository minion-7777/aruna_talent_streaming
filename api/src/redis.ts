import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  connectTimeout: 5000,
});

redis.on('error', (err) => {
  console.error('[redis]', err.message);
});

export async function getViewerCount(streamId: string): Promise<number> {
  const count = await redis.get(`viewers:${streamId}`);
  return count ? parseInt(count, 10) : 0;
}

export async function getPlatformViewerCount(): Promise<number> {
  const count = await redis.get('viewers:platform');
  return count ? parseInt(count, 10) : 0;
}

export async function getIngestLoad(node: string): Promise<number> {
  const count = await redis.get(`ingest:load:${node}`);
  return count ? parseInt(count, 10) : 0;
}

export async function incrementIngestLoad(node: string): Promise<void> {
  await redis.incr(`ingest:load:${node}`);
}

export async function decrementIngestLoad(node: string): Promise<void> {
  const val = await redis.decr(`ingest:load:${node}`);
  if (val < 0) await redis.set(`ingest:load:${node}`, '0');
}

export async function setActiveStreams(streamIds: string[]): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.del('live:streams');
  if (streamIds.length > 0) {
    pipeline.sadd('live:streams', ...streamIds);
  }
  await pipeline.exec();
}

export async function getActiveStreamCount(): Promise<number> {
  return redis.scard('live:streams');
}
