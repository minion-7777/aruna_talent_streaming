import { redis } from './redis-store.js';

const SESSION_TTL_SEC = 45;

function clientIdFromIp(ip: string | undefined): string {
  return ip?.split(',')[0]?.trim() || 'unknown';
}

function sessionKey(streamId: string, clientId: string): string {
  return `viewer:session:${streamId}:${clientId}`;
}

async function publishViewerCount(streamId: string, count: number): Promise<void> {
  await redis.publish(
    'metrics',
    JSON.stringify({ type: 'viewer_count', streamId, count }),
  );
}

async function countSessionsForStream(streamId: string): Promise<number> {
  let count = 0;
  let cursor = '0';
  const pattern = `viewer:session:${streamId}:*`;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    count += keys.length;
  } while (cursor !== '0');
  return count;
}

async function countPlatformSessions(): Promise<number> {
  let count = 0;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'viewer:session:*', 'COUNT', 500);
    cursor = next;
    count += keys.length;
  } while (cursor !== '0');
  return count;
}

async function syncViewerCountForStream(streamId: string): Promise<number> {
  const count = await countSessionsForStream(streamId);
  const platform = await countPlatformSessions();
  await redis.set(`viewers:${streamId}`, String(count));
  await redis.set('viewers:platform', String(platform));
  if (count > 0) {
    await redis.expire(`viewers:${streamId}`, 120);
  }
  await publishViewerCount(streamId, count);
  return count;
}

export async function recordViewer(
  streamId: string,
  ip: string | undefined,
): Promise<number> {
  const clientId = clientIdFromIp(ip);
  await redis.set(sessionKey(streamId, clientId), '1', 'EX', SESSION_TTL_SEC);
  return syncViewerCountForStream(streamId);
}

export async function removeViewer(
  streamId: string,
  ip: string | undefined,
): Promise<number> {
  const clientId = clientIdFromIp(ip);
  await redis.del(sessionKey(streamId, clientId));
  return syncViewerCountForStream(streamId);
}

export async function refreshViewerSession(
  streamId: string,
  ip: string | undefined,
): Promise<void> {
  const clientId = clientIdFromIp(ip);
  await redis.expire(sessionKey(streamId, clientId), SESSION_TTL_SEC);
}

export async function getViewerCount(streamId: string): Promise<number> {
  const count = await redis.get(`viewers:${streamId}`);
  return count ? parseInt(count, 10) : 0;
}
