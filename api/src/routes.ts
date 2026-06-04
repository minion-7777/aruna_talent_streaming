import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from './config.js';
import {
  createStream,
  endStream,
  getStream,
  handlePublish,
  listStreams,
} from './services/streams.js';
import { syncIngestState } from './services/ingest-sync.js';
import {
  getActiveStreamCount,
  getIngestLoad,
  getPlatformViewerCount,
} from './redis.js';
import { pool } from './db.js';

const createBody = z.object({
  username: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
});

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/streams', async (req, reply) => {
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const stream = await createStream(parsed.data.username, parsed.data.title);
    return reply.status(201).send(stream);
  });

  app.get('/v1/streams', async (req) => {
    const liveOnly = (req.query as { live?: string }).live === 'true';
    if (liveOnly) await syncIngestState();
    return listStreams(liveOnly);
  });

  app.get<{ Params: { id: string } }>('/v1/streams/:id', async (req, reply) => {
    await syncIngestState();
    const stream = await getStream(req.params.id);
    if (!stream) return reply.status(404).send({ error: 'Stream not found' });
    return stream;
  });

  app.post<{ Params: { id: string } }>(
    '/v1/streams/:id/end',
    async (req, reply) => {
      const body = z.object({ username: z.string() }).safeParse(req.body);
      if (!body.success) {
        return reply.status(400).send({ error: 'username required' });
      }
      const stream = await endStream(req.params.id, body.data.username);
      if (!stream) return reply.status(404).send({ error: 'Stream not found' });
      return stream;
    },
  );
}

export async function hookRoutes(app: FastifyInstance): Promise<void> {
  // MediaMTX external auth webhook
  app.post('/hooks/mediamtx/auth', async (req, reply) => {
    const body = req.body as {
      action?: string;
      path?: string;
      query?: string;
      user?: string;
      password?: string;
    };

    const action = body.action ?? '';
    const isPublish =
      action === 'publish' ||
      action === 'read' ||
      body.path?.startsWith('live/');

    if (action === 'publish') {
      const streamKey = extractStreamKey(body.path, body.password);
      if (!streamKey) return reply.status(401).send({ error: 'unauthorized' });
      const ok = await handlePublish(streamKey, 'publish');
      return ok ? reply.send({}) : reply.status(401).send({ error: 'unauthorized' });
    }

    if (action === 'publishDone' || action === 'publish_done') {
      const streamKey = extractStreamKey(body.path, body.password);
      if (streamKey) await handlePublish(streamKey, 'publish_done');
      return reply.send({});
    }

    // Allow HLS read for all live paths
    if (isPublish || action === 'read') {
      return reply.send({});
    }

    return reply.status(401).send({ error: 'unauthorized' });
  });

  app.post('/hooks/mediamtx/run-on-publish', async (req) => {
    const body = req.body as { path?: string };
    const streamKey = body.path?.replace(/^live\//, '');
    if (streamKey) await handlePublish(streamKey, 'publish');
    return { ok: true };
  });

  app.post('/hooks/mediamtx/run-on-unpublish', async (req) => {
    const body = req.body as { path?: string };
    const streamKey = body.path?.replace(/^live\//, '');
    if (streamKey) await handlePublish(streamKey, 'publish_done');
    return { ok: true };
  });

  // Called by nginx mirror when a browser loads an HLS playlist (direct m3u8 URL)
  app.get('/v1/hooks/hls-viewer', async (req, reply) => {
    const uri =
      (req.headers['x-original-uri'] as string) ||
      (req.query as { uri?: string }).uri ||
      '';
    const ip = req.headers['x-forwarded-for'] as string | undefined;
    const { recordHlsViewer } = await import('./services/hls-viewer.js');
    await recordHlsViewer(uri, ip);
    return reply.status(204).send();
  });
}

function extractStreamKey(path?: string, password?: string): string | null {
  if (password) return password;
  if (!path) return null;
  const match = path.match(/^live\/(.+)$/);
  if (match) return match[1];
  return path.split('/').pop() ?? null;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready', instance: config.hostname };
    } catch {
      return reply.status(503).send({ status: 'not ready' });
    }
  });

  app.get('/health/live', async () => ({
    status: 'live',
    instance: config.hostname,
    uptime: process.uptime(),
  }));

  app.get('/v1/platform/metrics', async () => {
    const ingestLoads = await Promise.all(
      config.ingestNodes.map(async (node: string) => ({
        node,
        activeStreams: await getIngestLoad(node),
      })),
    );

    const liveStreams = await getActiveStreamCount();
    const platformViewers = await getPlatformViewerCount();

    return {
      instance: config.hostname,
      uptime: process.uptime(),
      liveStreams,
      platformViewers,
      ingestNodes: ingestLoads,
      ingestPoolSize: config.ingestNodes.length,
      timestamp: new Date().toISOString(),
    };
  });
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/internal/')) return;
    const key = req.headers['x-internal-key'];
    if (key !== config.internalApiKey) {
      return reply.status(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/internal/config', async () => ({
    ingestNodes: config.ingestNodes,
    hostname: config.hostname,
  }));
}
