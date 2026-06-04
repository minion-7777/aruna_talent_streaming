import { AppNav } from '@/components/AppNav';
import { LiveMetricsBar } from '@/components/LiveMetricsBar';
import { LiveStreamGrid } from '@/components/LiveStreamGrid';
import { listStreams, getPlatformMetrics } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [streams, metrics] = await Promise.all([
    listStreams(true).catch(() => []),
    getPlatformMetrics().catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Live now
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Horizontally scaled ingest, API, and realtime — add replicas to handle more streams and viewers.
          </p>
          <div className="mt-4">
            <LiveMetricsBar initial={metrics ?? undefined} />
          </div>
        </div>

        <LiveStreamGrid initial={streams} />
      </main>
    </div>
  );
}
