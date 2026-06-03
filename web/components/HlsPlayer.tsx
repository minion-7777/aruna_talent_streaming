'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
}

export function HlsPlayer({ src, autoPlay = true, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error' | 'waiting'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setStatus('loading');
    setError(null);

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => setStatus('playing'));
      if (autoPlay) void video.play().catch(() => setStatus('waiting'));
      return;
    }

    if (!Hls.isSupported()) {
      setStatus('error');
      setError('HLS not supported in this browser');
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
    });

    hls.loadSource(src);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setStatus('playing');
      if (autoPlay) void video.play().catch(() => setStatus('waiting'));
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setStatus('error');
          setError('Playback failed');
          hls.destroy();
        }
      }
    });

    return () => hls.destroy();
  }, [src, autoPlay]);

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${className ?? ''}`}>
      <video
        ref={videoRef}
        controls
        playsInline
        className="w-full aspect-video"
      />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
          Loading stream…
        </div>
      )}
      {status === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
          Waiting for broadcaster…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-red-300 text-sm p-4 text-center">
          {error ?? 'Unable to play stream'}
        </div>
      )}
    </div>
  );
}
