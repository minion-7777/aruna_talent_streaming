function getApiUrl(): string {
  // Resolve at request time so Docker runtime env vars are picked up
  if (process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return 'http://localhost:8080/api';
}

export interface Stream {
  id: string;
  username: string;
  title: string;
  state: string;
  ingestNode: string;
  rtmpUrl: string;
  streamKey: string;
  playbackUrl: string;
  viewerCount: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PlatformMetrics {
  instance: string;
  uptime: number;
  liveStreams: number;
  platformViewers: number;
  ingestNodes: { node: string; activeStreams: number }[];
  ingestPoolSize: number;
  timestamp: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function listStreams(liveOnly = false) {
  return apiFetch<Stream[]>(`/v1/streams${liveOnly ? '?live=true' : ''}`);
}

export function getStream(id: string) {
  return apiFetch<Stream>(`/v1/streams/${id}`);
}

export function createStream(username: string, title: string) {
  return apiFetch<Stream>('/v1/streams', {
    method: 'POST',
    body: JSON.stringify({ username, title }),
  });
}

export function endStream(id: string, username: string) {
  return apiFetch<Stream>(`/v1/streams/${id}/end`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export function getPlatformMetrics() {
  return apiFetch<PlatformMetrics>('/v1/platform/metrics');
}

export const wsUrl =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
