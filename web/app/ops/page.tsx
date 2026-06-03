'use client';

import { useEffect, useState } from 'react';
import { AppNav } from '@/components/AppNav';
import type { PlatformMetrics } from '@/lib/api';

interface ServiceHealth {
  name: string;
  status: string;
  instance?: string;
  connections?: number;
}

export default function OpsPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [history, setHistory] = useState<{ t: string; viewers: number; streams: number }[]>([]);

  useEffect(() => {
    const poll = async () => {
      try {
        const [metricsRes, healthRes] = await Promise.all([
          fetch('/api/metrics'),
          fetch('/api/health'),
        ]);
        if (metricsRes.ok) {
          const m = (await metricsRes.json()) as PlatformMetrics;
          setMetrics(m);
          setHistory((prev) => {
            const next = [
              ...prev,
              {
                t: new Date().toLocaleTimeString(),
                viewers: m.platformViewers,
                streams: m.liveStreams,
              },
            ];
            return next.slice(-20);
          });
        }
        if (healthRes.ok) {
          setHealth(await healthRes.json());
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">Scaling dashboard</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400 max-w-2xl">
          Stateless control plane and ingest pool — scale replicas locally to increase capacity for concurrent streams and WebSocket viewers.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Live streams" value={metrics?.liveStreams ?? '—'} />
          <StatCard label="Platform viewers" value={metrics?.platformViewers ?? '—'} />
          <StatCard label="Ingest nodes" value={metrics?.ingestPoolSize ?? '—'} />
          <StatCard
            label="API instance"
            value={metrics?.instance ?? '—'}
            mono
          />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="font-semibold mb-4">Ingest load distribution</h2>
            <div className="space-y-3">
              {(metrics?.ingestNodes ?? []).map((node) => (
                <div key={node.node}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-mono">{node.node}</span>
                    <span>{node.activeStreams} streams</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 transition-all"
                      style={{
                        width: `${Math.min(100, (node.activeStreams / Math.max(1, metrics?.liveStreams ?? 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h2 className="font-semibold mb-4">Service health</h2>
            <ul className="space-y-2 text-sm">
              {health.length === 0 ? (
                <li className="text-zinc-500">Checking services…</li>
              ) : (
                health.map((s) => (
                  <li
                    key={s.name + (s.instance ?? '')}
                    className="flex items-center justify-between rounded-lg bg-zinc-100 dark:bg-zinc-900 px-3 py-2"
                  >
                    <span>{s.name}</span>
                    <span className="font-mono text-xs text-emerald-600">
                      {s.instance ?? s.status}
                      {s.connections != null ? ` (${s.connections} ws)` : ''}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="font-semibold mb-4">Viewer / stream timeline</h2>
          <div className="flex items-end gap-1 h-24">
            {history.map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-violet-500 rounded-t"
                  style={{ height: `${Math.max(4, h.viewers * 8)}px` }}
                  title={`${h.viewers} viewers`}
                />
                <div
                  className="w-full bg-emerald-500 rounded-t opacity-60"
                  style={{ height: `${Math.max(4, h.streams * 12)}px` }}
                  title={`${h.streams} streams`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-violet-500" /> Viewers
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded bg-emerald-500" /> Streams
            </span>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50 dark:bg-violet-950/20 p-6">
          <h2 className="font-semibold text-violet-900 dark:text-violet-200 mb-3">
            Scale locally
          </h2>
          <pre className="rounded-lg bg-zinc-900 text-zinc-100 p-4 text-sm overflow-x-auto font-mono">
{`# Scale API + realtime replicas
./scripts/scale.sh api=3 realtime=2

# Or with docker compose directly
docker compose up -d --scale api=3 --scale realtime=2

# Ingest pool: 2 nodes (ingest-1, ingest-2) — add more in compose + nginx`}
          </pre>
          <ul className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 space-y-2 list-disc list-inside">
            <li>API pods are stateless — nginx load-balances with least_conn</li>
            <li>Realtime pods share viewer counts via Redis pub/sub</li>
            <li>HLS segments cached at nginx edge (simulates CDN offload)</li>
            <li>Stream create picks least-loaded ingest node automatically</li>
          </ul>
        </section>

        <section className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="font-semibold mb-3">Architecture</h2>
          <pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 leading-relaxed">
{`OBS ──RTMP──▶ [ingest-1 | ingest-2] ──HLS──▶ nginx (cache) ──▶ viewers
                    │                              ▲
                    └── hooks ──▶ [api × N] ◀──────┘ BFF
                                      │
                                 [realtime × N] ◀── WS heartbeats
                                      │
                                   redis + postgres`}
          </pre>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${mono ? 'font-mono text-lg' : ''}`}>
        {value}
      </div>
    </div>
  );
}
