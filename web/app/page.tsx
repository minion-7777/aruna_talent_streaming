import { AppNav } from '@/components/AppNav';
import { LiveMetricsBar } from '@/components/LiveMetricsBar';
import { StreamCard } from '@/components/StreamCard';
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

        {streams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
            <p className="text-zinc-500">No live streams yet.</p>
            <a
              href="/studio"
              className="mt-4 inline-block rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500"
            >
              Go live
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {streams.map((stream) => (
              <StreamCard key={stream.id} stream={stream} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
