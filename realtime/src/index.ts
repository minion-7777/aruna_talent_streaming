import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Redis } from 'ioredis';

const port = Number(process.env.PORT ?? 3002);
const hostname = process.env.HOSTNAME ?? 'realtime-local';
const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';

function createRedisClient(label: string): Redis {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    lazyConnect: true,
  });
  client.on('error', (err) => {
    console.error(`[redis:${label}]`, err.message);
  });
  return client;
}

const redis = createRedisClient('main');
const sub = createRedisClient('sub');

const connections = new Set<WebSocket>();

interface ClientState {
  streamId?: string;
  heartbeat?: ReturnType<typeof setInterval>;
}

async function incrementViewer(streamId: string): Promise<number> {
  const pipeline = redis.pipeline();
  pipeline.incr(`viewers:${streamId}`);
  pipeline.incr('viewers:platform');
  pipeline.expire(`viewers:${streamId}`, 120);
  const results = await pipeline.exec();
  const count = results?.[0]?.[1] as number;
  await redis.publish(
    'metrics',
    JSON.stringify({ type: 'viewer_count', streamId, count }),
  );
  return count;
}

async function decrementViewer(streamId: string): Promise<number> {
  const pipeline = redis.pipeline();
  pipeline.decr(`viewers:${streamId}`);
  pipeline.decr('viewers:platform');
  const results = await pipeline.exec();
  let count = (results?.[0]?.[1] as number) ?? 0;
  if (count < 0) {
    await redis.set(`viewers:${streamId}`, '0');
    count = 0;
  }
  const platform = await redis.get('viewers:platform');
  if (platform && parseInt(platform, 10) < 0) {
    await redis.set('viewers:platform', '0');
  }
  await redis.publish(
    'metrics',
    JSON.stringify({ type: 'viewer_count', streamId, count }),
  );
  return count;
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

  wss.on('connection', (ws) => {
    connections.add(ws);
    const state: ClientState = {};

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
          if (state.streamId && state.streamId !== msg.streamId) {
            await decrementViewer(state.streamId);
          }
          state.streamId = msg.streamId;
          const count = await incrementViewer(msg.streamId);
          send(ws, { type: 'joined', streamId: msg.streamId, viewerCount: count });

          if (state.heartbeat) clearInterval(state.heartbeat);
          state.heartbeat = setInterval(async () => {
            await redis.expire(`viewers:${msg.streamId}`, 120);
            send(ws, { type: 'heartbeat_ack' });
          }, 25000);
        }

        if (msg.type === 'leave' && state.streamId) {
          const count = await decrementViewer(state.streamId);
          send(ws, { type: 'left', streamId: state.streamId, viewerCount: count });
          if (state.heartbeat) clearInterval(state.heartbeat);
          state.streamId = undefined;
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
      if (state.streamId) await decrementViewer(state.streamId);
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Realtime gateway on :${port} (${hostname})`);
  });

  const shutdown = async () => {
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
