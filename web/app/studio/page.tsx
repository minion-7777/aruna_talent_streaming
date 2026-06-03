'use client';

import { useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
      setStream(await res.json());
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
      setStream(await res.json());
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
      <main className="mx-auto max-w-2xl px-4 py-8">
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
          {!stream ? (
            <div className="mt-8 space-y-4">
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
            <div className="mt-8 space-y-6">
              <StatusBadge state={stream.state} />

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
                  <a href={`/watch/${stream.id}`} className="text-violet-600 hover:underline">
                    /watch/{stream.id}
                  </a>
                </p>
              </div>

              <div className="flex gap-3">
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
        </Show>
      </main>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const live = ['LIVE', 'INGESTING', 'DEGRADED'].includes(state);
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}
      />
      <span className="font-semibold">{state}</span>
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
