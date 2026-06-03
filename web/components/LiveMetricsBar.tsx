'use client';

import { useEffect, useState } from 'react';
import type { PlatformMetrics } from '@/lib/api';
import { wsUrl } from '@/lib/api';

export function LiveMetricsBar({
  initial,
  pollMs = 5000,
}: {
  initial?: PlatformMetrics;
  pollMs?: number;
}) {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(initial ?? null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (res.ok) setMetrics(await res.json());
      } catch {
        /* ignore */
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, pollMs);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = () => fetchMetrics();
    } catch {
      /* ignore */
    }

    return () => {
      clearInterval(interval);
      ws?.close();
    };
  }, [pollMs]);

  if (!metrics) return null;

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <Metric label="Live streams" value={metrics.liveStreams} />
      <Metric label="Viewers" value={metrics.platformViewers} />
      <Metric label="Ingest pool" value={metrics.ingestPoolSize} />
      <Metric
        label="Realtime"
        value={wsConnected ? 'connected' : 'polling'}
        mono
      />
    </div>
  );
}

function Metric({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800/80 px-3 py-2">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold ${mono ? 'font-mono text-sm' : ''}`}>
        {value}
      </div>
    </div>
  );
}
