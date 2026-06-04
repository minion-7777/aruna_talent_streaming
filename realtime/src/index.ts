import os from 'node:os';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { IncomingMessage as WsIncomingMessage } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { redis } from './redis-store.js';
import { startHeartbeat } from './registry.js';
import {
  getViewerCount,
  recordViewer,
  removeViewer,
  refreshViewerSession,
} from './viewers.js';

const port = Number(process.env.PORT ?? 3002);
function resolveHostname(): string {
  const id = process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? os.hostname();
  if (id && id !== '0.0.0.0') return id;
  return os.hostname();
}
const hostname = resolveHostname();
const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';

const sub = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  lazyConnect: true,
});

sub.on('error', (err) => {
  console.error('[redis:sub]', err.message);
});

const connections = new Set<WebSocket>();

interface ClientState {
  streamId?: string;
  clientIp?: string;
  heartbeat?: ReturnType<typeof setInterval>;
  /** true after `join` — broadcaster studio uses `observe` only */
  countedAsViewer?: boolean;
}

function clientIpFromRequest(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded;
  return req.socket.remoteAddress ?? 'unknown';
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

async function main() {
  try {
    await redis.connect();
    await sub.connect();
    await redis.ping();
  } catch (err) {
    console.error(
      `Cannot connect to Redis at ${redisUrl}. Start it with: docker compose up redis -d`,
    );
    console.error(err);
    process.exit(1);
  }

  await sub.subscribe('metrics');
  sub.on('message', (_channel, message) => {
    for (const ws of connections) {
      send(ws, { type: 'metrics', payload: JSON.parse(message) });
    }
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready', instance: hostname }));
      return;
    }
    if (req.url === '/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'live',
          instance: hostname,
          connections: connections.size,
          uptime: process.uptime(),
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req: WsIncomingMessage) => {
    connections.add(ws);
    const state: ClientState = { clientIp: clientIpFromRequest(req) };

    send(ws, {
      type: 'connected',
      instance: hostname,
      platformConnections: connections.size,
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          streamId?: string;
        };

        if (msg.type === 'join' && msg.streamId) {
          if (state.countedAsViewer && state.streamId && state.streamId !== msg.streamId) {
            await removeViewer(state.streamId, state.clientIp);
          }
          state.streamId = msg.streamId;
          state.countedAsViewer = true;
          const count = await recordViewer(msg.streamId, state.clientIp);
          send(ws, { type: 'joined', streamId: msg.streamId, viewerCount: count });

          if (state.heartbeat) clearInterval(state.heartbeat);
          state.heartbeat = setInterval(async () => {
            if (state.streamId && state.countedAsViewer) {
              await refreshViewerSession(state.streamId, state.clientIp);
            }
            send(ws, { type: 'heartbeat_ack' });
          }, 25000);
        }

        if (msg.type === 'observe' && msg.streamId) {
          if (state.countedAsViewer && state.streamId) {
            await removeViewer(state.streamId, state.clientIp);
            state.countedAsViewer = false;
          }
          if (state.heartbeat) clearInterval(state.heartbeat);
          state.streamId = msg.streamId;
          const count = await getViewerCount(msg.streamId);
          send(ws, { type: 'observed', streamId: msg.streamId, viewerCount: count });
        }

        if (msg.type === 'leave' && state.streamId && state.countedAsViewer) {
          const count = await removeViewer(state.streamId, state.clientIp);
          send(ws, { type: 'left', streamId: state.streamId, viewerCount: count });
          if (state.heartbeat) clearInterval(state.heartbeat);
          state.streamId = undefined;
          state.countedAsViewer = false;
        }

        if (msg.type === 'ping') {
          send(ws, { type: 'pong', instance: hostname });
        }
      } catch {
        send(ws, { type: 'error', message: 'Invalid message' });
      }
    });

    ws.on('close', async () => {
      connections.delete(ws);
      if (state.heartbeat) clearInterval(state.heartbeat);
      if (state.streamId && state.countedAsViewer) {
        await removeViewer(state.streamId, state.clientIp);
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Realtime gateway on :${port} (${hostname})`);
  });

  const stopRegistry = startHeartbeat('realtime', () => ({
    uptime: process.uptime(),
    connections: connections.size,
  }));

  const shutdown = async () => {
    stopRegistry();
    wss.close();
    server.close();
    await redis.quit();
    await sub.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
