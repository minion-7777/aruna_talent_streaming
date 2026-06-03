import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.postgresUrl });

export type StreamState =
  | 'CREATED'
  | 'INGESTING'
  | 'LIVE'
  | 'DEGRADED'
  | 'ENDING'
  | 'ENDED'
  | 'ARCHIVED';

export interface StreamRow {
  id: string;
  username: string;
  title: string;
  stream_key: string;
  ingest_node: string;
  state: StreamState;
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
}

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      stream_key TEXT NOT NULL UNIQUE,
      ingest_node TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'CREATED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_streams_state ON streams(state);
    CREATE INDEX IF NOT EXISTS idx_streams_username ON streams(username);
  `);
}
