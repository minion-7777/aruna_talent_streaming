'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Show, SignInButton } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';
import { AppNav } from '@/components/AppNav';
import type { Stream } from '@/lib/api';

export default function StudioPage() {
  const { user } = useUser();
  const username =
    user?.username ??
    user?.firstName ??
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ??
    '';

  const [title, setTitle] = useState('');
  const [stream, setStream] = useState<Stream | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadStreams = useCallback(async (showLoading = false) => {
    if (showLoading) setListLoading(true);
    try {
      const res = await fetch('/api/streams?mine=true');
      if (res.ok) setStreams(await res.json());
    } catch {
      /* ignore */
    } finally {
      if (showLoading) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadStreams(true);
    const interval = setInterval(() => loadStreams(false), 10000);
    return () => clearInterval(interval);
  }, [user, loadStreams]);

  useEffect(() => {
    if (!stream) return;
    const current = streams.find((s) => s.id === stream.id);
    if (current && current.state !== stream.state) {
      setStream(current);
    }
  }, [streams, stream]);

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || `${username}'s stream` }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as Stream;
      setStream(created);
      await loadStreams(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create stream');
    } finally {
      setLoading(false);
    }
  };

  const end = async () => {
    if (!stream) return;
    setLoading(true);
    try {
      const res = await fetch('/api/streams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stream.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as Stream;
      setStream(updated);
      await loadStreams(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end stream');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold">Broadcaster studio</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Create a stream, then publish from OBS using the RTMP credentials below.
        </p>

        <Show when="signed-out">
          <div className="mt-8 rounded-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-zinc-500 mb-4">Sign in to go live</p>
            <SignInButton />
          </div>
        </Show>

        <Show when="signed-in">
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold mb-4">Your streams</h2>
              {listLoading ? (
                <p className="text-sm text-zinc-500">Loading streams…</p>
              ) : streams.length === 0 ? (
                <p className="text-sm text-zinc-500 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
                  No streams yet. Create one to get started.
                </p>
              ) : (
                <ul className="space-y-2">
                  {streams.map((s) => (
                    <StreamListItem
                      key={s.id}
                      stream={s}
                      selected={stream?.id === s.id}
                      onSelect={() => setStream(s)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section>
              {!stream ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Create stream</h2>
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Stream title
                    </span>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={`${username}'s stream`}
                      className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2"
                    />
                  </label>
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                  <button
                    onClick={create}
                    disabled={loading}
                    className="rounded-full bg-violet-600 px-6 py-2.5 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    {loading ? 'Creating…' : 'Create stream'}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold truncate">{stream.title}</h2>
                    <StatusBadge state={stream.state} />
                  </div>

                  <CredentialBlock
                    label="RTMP URL"
                    value={stream.rtmpUrl}
                    copied={copied === 'rtmp'}
                    onCopy={() => copy('rtmp', stream.rtmpUrl)}
                  />
                  <CredentialBlock
                    label="Stream key"
                    value={stream.streamKey}
                    copied={copied === 'key'}
                    onCopy={() => copy('key', stream.streamKey)}
                    secret
                  />

                  <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 p-4 text-sm space-y-1">
                    <p>
                      <span className="text-zinc-500">Ingest node:</span>{' '}
                      <code className="font-mono">{stream.ingestNode}</code>
                    </p>
                    <p>
                      <span className="text-zinc-500">Watch:</span>{' '}
                      <Link href={`/watch/${stream.id}`} className="text-violet-600 hover:underline">
                        /watch/{stream.id}
                      </Link>
                    </p>
                    <p>
                      <span className="text-zinc-500">Viewers:</span> {stream.viewerCount}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {!['ENDED', 'ARCHIVED'].includes(stream.state) && (
                      <button
                        onClick={end}
                        disabled={loading}
                        className="rounded-full border border-red-300 text-red-600 px-5 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        End stream
                      </button>
                    )}
                    <button
                      onClick={() => setStream(null)}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-2 text-sm"
                    >
                      New stream
                    </button>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-600 dark:text-zinc-400">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">OBS setup</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Settings → Stream → Service: Custom</li>
                      <li>Paste RTMP URL and Stream key</li>
                      <li>Start streaming — status becomes LIVE when ingest receives video</li>
                    </ol>
                  </div>
                </div>
              )}
            </section>
          </div>
        </Show>
      </main>
    </div>
  );
}

function StreamListItem({
  stream,
  selected,
  onSelect,
}: {
  stream: Stream;
  selected: boolean;
  onSelect: () => void;
}) {
  const live = ['LIVE', 'INGESTING', 'DEGRADED'].includes(stream.state);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
          selected
            ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate">{stream.title}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              live
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {stream.state}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 truncate">
          {stream.viewerCount} watching · {stream.ingestNode} ·{' '}
          {new Date(stream.createdAt).toLocaleString()}
        </p>
      </button>
    </li>
  );
}

function StatusBadge({ state }: { state: string }) {
  const live = ['LIVE', 'INGESTING', 'DEGRADED'].includes(state);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}
      />
      <span className="font-semibold text-sm">{state}</span>
    </div>
  );
}

function CredentialBlock({
  label,
  value,
  onCopy,
  copied,
  secret,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  secret?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <button
          onClick={onCopy}
          className="text-xs text-violet-600 hover:underline"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <code className="block w-full rounded-lg bg-zinc-100 dark:bg-zinc-900 px-4 py-3 font-mono text-sm break-all">
        {secret ? '•'.repeat(Math.min(value.length, 24)) : value}
      </code>
      {secret && (
        <p className="mt-1 text-xs text-zinc-400 font-mono break-all">{value}</p>
      )}
    </div>
  );
}
