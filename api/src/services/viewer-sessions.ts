import { Redis } from 'ioredis';
import { config } from '../config.js';
import { onViewerSessionExpired } from './viewers.js';

/** Decrement counts when HLS (or WS heartbeat) sessions expire without an explicit leave. */
export async function startViewerSessionExpiryListener(): Promise<Redis> {
  const sub = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });

  sub.on('error', (err) => {
    console.error('[viewer-sessions]', err.message);
  });

  sub.on('pmessage', (_pattern, _channel, key) => {
    if (!key.startsWith('viewer:session:')) return;
    void onViewerSessionExpired(key).catch((err) => {
      console.error('[viewer-sessions] expiry handler failed', err);
    });
  });

  await sub.connect();
  await sub.psubscribe('__keyevent@0__:expired');
  console.log('[viewer-sessions] listening for session expiry');
  return sub;
}
