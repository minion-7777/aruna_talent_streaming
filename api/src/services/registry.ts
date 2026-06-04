import os from 'node:os';
import { redis } from '../redis.js';

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

export async function listServiceInstances(
  service: 'api' | 'realtime',
): Promise<{ instance: string; meta: Record<string, unknown> }[]> {
  const instances: { instance: string; meta: Record<string, unknown> }[] = [];
  let cursor = '0';
  const pattern = `platform:heartbeat:${service}:*`;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const raw = await redis.get(key);
      const suffix = key.slice(`platform:heartbeat:${service}:`.length);
      const meta = raw
        ? (JSON.parse(raw) as Record<string, unknown>)
        : { instance: suffix };
      instances.push({
        instance: (meta.instance as string) ?? suffix,
        meta,
      });
    }
  } while (cursor !== '0');
  instances.sort((a, b) => a.instance.localeCompare(b.instance));
  return instances;
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
