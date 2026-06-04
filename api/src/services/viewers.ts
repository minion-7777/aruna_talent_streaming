import { redis } from '../redis.js';

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

/** Reconcile counters from active session keys (safe if multiple handlers run). */
export async function syncViewerCountForStream(streamId: string): Promise<number> {
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

/** Count a viewer once per IP per stream; TTL refresh = still watching (WS + HLS). */
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

export function parseViewerSessionKey(key: string): { streamId: string } | null {
  const match = key.match(/^viewer:session:([^:]+):/);
  if (!match) return null;
  return { streamId: match[1] };
}

export async function onViewerSessionExpired(expiredKey: string): Promise<void> {
  const parsed = parseViewerSessionKey(expiredKey);
  if (!parsed) return;
  await syncViewerCountForStream(parsed.streamId);
}

export function extractStreamKeyFromHlsUri(uri: string): string | null {
  const match = uri.match(/\/live\/([^/]+)\/index\.m3u8/);
  return match?.[1] ?? null;
}
