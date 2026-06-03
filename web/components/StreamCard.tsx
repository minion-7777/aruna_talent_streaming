'use client';

import Link from 'next/link';
import type { Stream } from '@/lib/api';

function stateColor(state: string) {
  switch (state) {
    case 'LIVE':
      return 'bg-emerald-500';
    case 'INGESTING':
      return 'bg-amber-500';
    case 'DEGRADED':
      return 'bg-orange-500';
    default:
      return 'bg-zinc-500';
  }
}

export function StreamCard({ stream }: { stream: Stream }) {
  const isLive = ['LIVE', 'INGESTING', 'DEGRADED'].includes(stream.state);

  return (
    <Link
      href={`/watch/${stream.id}`}
      className="group block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden hover:border-violet-500/50 transition-colors"
    >
      <div className="aspect-video bg-zinc-900 flex items-center justify-center relative">
        <div className="text-zinc-600 text-sm">Live preview</div>
        {isLive && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
            <span className={`h-2 w-2 rounded-full ${stateColor(stream.state)} animate-pulse`} />
            {stream.state}
          </span>
        )}
        <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
          {stream.viewerCount} watching
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-violet-400 transition-colors truncate">
          {stream.title}
        </h3>
        <p className="text-sm text-zinc-500 mt-1">{stream.username}</p>
        <p className="text-xs text-zinc-400 mt-2 font-mono">{stream.ingestNode}</p>
      </div>
    </Link>
  );
}
