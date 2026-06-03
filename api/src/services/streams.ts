import { nanoid } from 'nanoid';
import { pool, type StreamRow, type StreamState } from '../db.js';
import { config } from '../config.js';
import {
  decrementIngestLoad,
  getIngestLoad,
  getViewerCount,
  incrementIngestLoad,
  setActiveStreams,
} from '../redis.js';

function pickIngestNode(): string {
  let best = config.ingestNodes[0];
  let bestLoad = Infinity;
  for (const node of config.ingestNodes) {
    const load = getIngestLoad(node);
    // sync pick using cached value — refreshed in async version
    void load;
  }
  return best;
}

async function pickIngestNodeAsync(): Promise<string> {
  let best = config.ingestNodes[0];
  let bestLoad = Infinity;
  for (const node of config.ingestNodes) {
    const load = await getIngestLoad(node);
    if (load < bestLoad) {
      bestLoad = load;
      best = node;
    }
  }
  return best;
}

export interface StreamDto {
  id: string;
  username: string;
  title: string;
  state: StreamState;
  ingestNode: string;
  rtmpUrl: string;
  streamKey: string;
  playbackUrl: string;
  viewerCount: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

function rtmpUrlForNode(ingestNode: string): string {
  const idx = config.ingestNodes.indexOf(ingestNode);
  const port =
    idx >= 0 && config.publicRtmpPorts[idx]
      ? config.publicRtmpPorts[idx]
      : config.rtmpPort;
  return `rtmp://${config.publicRtmpHost}:${port}/live`;
}

function toDto(row: StreamRow, viewerCount = 0): StreamDto {
  return {
    id: row.id,
    username: row.username,
    title: row.title,
    state: row.state,
    ingestNode: row.ingest_node,
    rtmpUrl: rtmpUrlForNode(row.ingest_node),
    streamKey: row.stream_key,
    playbackUrl: `${config.hlsBaseUrl}/${row.ingest_node}/live/${row.stream_key}/index.m3u8`,
    viewerCount,
    createdAt: row.created_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    endedAt: row.ended_at?.toISOString() ?? null,
  };
}

export async function createStream(
  username: string,
  title: string,
): Promise<StreamDto> {
  const id = nanoid(12);
  const streamKey = nanoid(24);
  const ingestNode = await pickIngestNodeAsync();

  const { rows } = await pool.query<StreamRow>(
    `INSERT INTO streams (id, username, title, stream_key, ingest_node, state)
     VALUES ($1, $2, $3, $4, $5, 'CREATED')
     RETURNING *`,
    [id, username, title, streamKey, ingestNode],
  );

  return toDto(rows[0]);
}

export async function getStream(id: string): Promise<StreamDto | null> {
  const { rows } = await pool.query<StreamRow>(
    'SELECT * FROM streams WHERE id = $1',
    [id],
  );
  if (!rows[0]) return null;
  const viewers = await getViewerCount(id);
  return toDto(rows[0], viewers);
}

export async function listStreams(liveOnly = false): Promise<StreamDto[]> {
  const query = liveOnly
    ? `SELECT * FROM streams WHERE state IN ('INGESTING', 'LIVE', 'DEGRADED') ORDER BY started_at DESC NULLS LAST`
    : `SELECT * FROM streams ORDER BY created_at DESC LIMIT 50`;
  const { rows } = await pool.query<StreamRow>(query);
  return Promise.all(
    rows.map(async (row: StreamRow) => toDto(row, await getViewerCount(row.id))),
  );
}

export async function endStream(id: string, username: string): Promise<StreamDto | null> {
  const { rows } = await pool.query<StreamRow>(
    `UPDATE streams SET state = 'ENDED', ended_at = NOW()
     WHERE id = $1 AND username = $2 AND state NOT IN ('ENDED', 'ARCHIVED')
     RETURNING *`,
    [id, username],
  );
  if (!rows[0]) return null;
  await decrementIngestLoad(rows[0].ingest_node);
  await refreshLiveSet();
  const viewers = await getViewerCount(id);
  return toDto(rows[0], viewers);
}

export async function refreshLiveSet(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM streams WHERE state IN ('INGESTING', 'LIVE', 'DEGRADED')`,
  );
  await setActiveStreams(rows.map((r: { id: string }) => r.id));
}

export async function handlePublish(
  streamKey: string,
  action: 'publish' | 'publish_done',
): Promise<boolean> {
  const { rows } = await pool.query<StreamRow>(
    'SELECT * FROM streams WHERE stream_key = $1',
    [streamKey],
  );
  const stream = rows[0];
  if (!stream) return false;

  if (action === 'publish') {
    if (stream.state === 'ENDED' || stream.state === 'ARCHIVED') return false;
    await pool.query(
      `UPDATE streams SET state = 'LIVE', started_at = COALESCE(started_at, NOW())
       WHERE stream_key = $1`,
      [streamKey],
    );
    await incrementIngestLoad(stream.ingest_node);
    await refreshLiveSet();
    return true;
  }

  await pool.query(
    `UPDATE streams SET state = 'ENDED', ended_at = NOW() WHERE stream_key = $1`,
    [streamKey],
  );
  await decrementIngestLoad(stream.ingest_node);
  await refreshLiveSet();
  return true;
}

export async function getStreamByKey(streamKey: string): Promise<StreamRow | null> {
  const { rows } = await pool.query<StreamRow>(
    'SELECT * FROM streams WHERE stream_key = $1',
    [streamKey],
  );
  return rows[0] ?? null;
}

// silence unused
void pickIngestNode;
