'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppNav } from '@/components/AppNav';
import { HlsPlayer } from '@/components/HlsPlayer';
import type { Stream } from '@/lib/api';
import { getWsUrl } from '@/lib/api';

export default function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const [streamId, setStreamId] = useState<string | null>(null);
  const [stream, setStream] = useState<Stream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setStreamId(p.id));
  }, [params]);

  useEffect(() => {
    if (!streamId) return;

    const load = async () => {
      try {
        const res = await fetch(`/api/streams/${streamId}`);
        if (!res.ok) throw new Error('Stream not found');
        const data = (await res.json()) as Stream;
        setStream(data);
        setViewerCount(data.viewerCount);
      } catch {
        setError('Stream not found');
      }
    };

    load();
    const poll = setInterval(load, 10000);
    return () => clearInterval(poll);
  }, [streamId]);

  useEffect(() => {
    if (!streamId) return;

    const ws = new WebSocket(getWsUrl());
    ws.onerror = () => ws.close();
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', streamId }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as {
        type: string;
        viewerCount?: number;
        payload?: { type: string; count?: number; streamId?: string };
      };
      if (msg.type === 'joined' && msg.viewerCount != null) {
        setViewerCount(msg.viewerCount);
      }
      if (msg.type === 'metrics' && msg.payload?.streamId === streamId) {
        setViewerCount(msg.payload.count ?? 0);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }));
      }
      ws.close();
    };
  }, [streamId]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppNav />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-zinc-500">{error}</p>
          <Link href="/" className="mt-4 inline-block text-violet-600 hover:underline">
            Back to browse
          </Link>
        </main>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <AppNav />
        <main className="mx-auto max-w-4xl px-4 py-16 text-center text-zinc-500">
          Loading…
        </main>
      </div>
    );
  }

  const isLive = ['LIVE', 'INGESTING', 'DEGRADED'].includes(stream.state);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {isLive && (
            <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase">
              Live
            </span>
          )}
          <h1 className="text-2xl font-bold">{stream.title}</h1>
        </div>
        <p className="text-zinc-500 mb-4">
          {stream.username} · {viewerCount} watching · {stream.ingestNode}
        </p>

        {isLive ? (
          <HlsPlayer src={stream.playbackUrl} />
        ) : (
          <div className="aspect-video rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400">
            Stream is {stream.state.toLowerCase()}
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Viewer count updates when watching here or when the HLS playlist URL is opened
          (same browser/IP counted once per ~45s).
        </p>
        <p className="mt-1 text-xs text-zinc-400 font-mono break-all">
          {stream.playbackUrl}
        </p>
      </main>
    </div>
  );
}
