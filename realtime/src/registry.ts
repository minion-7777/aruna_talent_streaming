import os from 'node:os';
import { redis } from './redis-store.js';

const HEARTBEAT_TTL_SEC = 25;
const HEARTBEAT_INTERVAL_MS = 10_000;

export function instanceId(): string {
  const id = process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? os.hostname();
  if (id && id !== '0.0.0.0') return id;
  return os.hostname();
}

function heartbeatKey(service: string, id: string): string {
  return `platform:heartbeat:${service}:${id}`;
}

export async function registerHeartbeat(
  service: 'api' | 'realtime',
  meta: Record<string, unknown>,
): Promise<void> {
  const id = instanceId();
  await redis.set(
    heartbeatKey(service, id),
    JSON.stringify({ ...meta, instance: id, at: new Date().toISOString() }),
    'EX',
    HEARTBEAT_TTL_SEC,
  );
}

export function startHeartbeat(
  service: 'api' | 'realtime',
  meta: () => Record<string, unknown>,
): () => void {
  const tick = () => {
    void registerHeartbeat(service, meta()).catch((err) => {
      console.error(`[registry:${service}]`, err);
    });
  };
  tick();
  const timer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
