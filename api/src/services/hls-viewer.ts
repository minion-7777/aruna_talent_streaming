import { pool, type StreamRow } from '../db.js';
import { recordViewer } from './viewers.js';

export async function recordHlsViewer(
  hlsUri: string,
  ip: string | undefined,
): Promise<void> {
  const match = hlsUri.match(/\/live\/([^/]+)\/index\.m3u8/);
  const streamKey = match?.[1];
  if (!streamKey) return;

  const { rows } = await pool.query<StreamRow>(
    'SELECT id FROM streams WHERE stream_key = $1',
    [streamKey],
  );
  const stream = rows[0];
  if (!stream) return;

  await recordViewer(stream.id, ip);
}
