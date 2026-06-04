'use client';

import { useCallback, useEffect, useState } from 'react';
import { StreamCard } from '@/components/StreamCard';
import type { Stream } from '@/lib/api';

export function LiveStreamGrid({ initial }: { initial: Stream[] }) {
  const [streams, setStreams] = useState(initial);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/streams?live=true');
      if (res.ok) setStreams(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (streams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
        <p className="text-zinc-500">No live streams yet.</p>
        <a
          href="/studio"
          className="mt-4 inline-block rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Go live
        </a>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {streams.map((stream) => (
        <StreamCard key={stream.id} stream={stream} />
      ))}
    </div>
  );
}
