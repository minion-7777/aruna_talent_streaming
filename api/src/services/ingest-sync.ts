import { pool, type StreamRow } from '../db.js';
import { config } from '../config.js';
import { handlePublish } from './streams.js';

/** Sync DB stream state with active RTMP publishes on ingest nodes. */
export async function syncIngestState(): Promise<void> {
  const { rows } = await pool.query<StreamRow>(
    `SELECT * FROM streams WHERE state IN ('CREATED', 'INGESTING', 'LIVE', 'DEGRADED')`,
  );

  const activeKeys = new Set<string>();

  for (const node of config.ingestNodes) {
    for (const row of rows.filter((r) => r.ingest_node === node)) {
      const publishing = await isPublishing(node, row.stream_key);
      if (publishing) {
        activeKeys.add(row.stream_key);
        if (row.state === 'CREATED' || row.state === 'INGESTING') {
          await handlePublish(row.stream_key, 'publish');
        }
      }
    }
  }

  for (const row of rows) {
    if (
      ['LIVE', 'INGESTING', 'DEGRADED'].includes(row.state) &&
      !activeKeys.has(row.stream_key)
    ) {
      const recentlyStarted =
        row.started_at && Date.now() - row.started_at.getTime() < 30_000;
      if (!recentlyStarted) {
        await handlePublish(row.stream_key, 'publish_done');
      }
    }
  }
}

async function isPublishing(ingestNode: string, streamKey: string): Promise<boolean> {
  const url = `http://${ingestNode}:8888/live/${streamKey}/index.m3u8`;
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes('#EXTM3U');
  } catch {
    return false;
  }
}
