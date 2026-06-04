import { redis } from './redis-store.js';

const SESSION_TTL_SEC = 45;

function clientIdFromIp(ip: string | undefined): string {
  return ip?.split(',')[0]?.trim() || 'unknown';
}

async function publishViewerCount(streamId: string, count: number): Promise<void> {
  await redis.publish(
    'metrics',
    JSON.stringify({ type: 'viewer_count', streamId, count }),
  );
}

export async function recordViewer(
  streamId: string,
  ip: string | undefined,
): Promise<number> {
  const clientId = clientIdFromIp(ip);
  const sessionKey = `viewer:session:${streamId}:${clientId}`;
  const isNew = await redis.set(sessionKey, '1', 'EX', SESSION_TTL_SEC, 'NX');
  if (!isNew) {
    const count = await redis.get(`viewers:${streamId}`);
    return count ? parseInt(count, 10) : 0;
  }

  const pipeline = redis.pipeline();
  pipeline.incr(`viewers:${streamId}`);
  pipeline.incr('viewers:platform');
  pipeline.expire(`viewers:${streamId}`, 120);
  const results = await pipeline.exec();
  const count = (results?.[0]?.[1] as number) ?? 1;
  await publishViewerCount(streamId, count);
  return count;
}

export async function removeViewer(
  streamId: string,
  ip: string | undefined,
): Promise<number> {
  const clientId = clientIdFromIp(ip);
  const sessionKey = `viewer:session:${streamId}:${clientId}`;
  const hadSession = await redis.del(sessionKey);
  if (!hadSession) {
    const count = await redis.get(`viewers:${streamId}`);
    return count ? parseInt(count, 10) : 0;
  }

  const pipeline = redis.pipeline();
  pipeline.decr(`viewers:${streamId}`);
  pipeline.decr('viewers:platform');
  const results = await pipeline.exec();
  let count = (results?.[0]?.[1] as number) ?? 0;
  if (count < 0) {
    await redis.set(`viewers:${streamId}`, '0');
    count = 0;
  }
  await publishViewerCount(streamId, count);
  return count;
}

export async function refreshViewerSession(
  streamId: string,
  ip: string | undefined,
): Promise<void> {
  const clientId = clientIdFromIp(ip);
  await redis.expire(`viewer:session:${streamId}:${clientId}`, SESSION_TTL_SEC);
  await redis.expire(`viewers:${streamId}`, 120);
}
