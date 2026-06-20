import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, CloudSun, Globe2, Youtube } from 'lucide-react';
import { parseSignageApp, type SignageApp } from '../lib/apps';

type Props = {
  url: string;
  title: string;
  mode?: 'thumbnail' | 'preview' | 'player';
  loopPlayback?: boolean;
  onPlaybackComplete?: () => void;
};

type WeatherPayload = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

export default function AppContent({ url, title, mode = 'preview', loopPlayback = false, onPlaybackComplete }: Props) {
  const app = useMemo(() => parseSignageApp(url), [url]);

  if (!app) {
    return <WebsiteFrame url={url} title={title} mode={mode} />;
  }

  if (app.kind === 'youtube') {
    return (
      <YouTubeFrame
        app={app}
        title={title}
        mode={mode}
        loopPlayback={loopPlayback}
        onPlaybackComplete={onPlaybackComplete}
      />
    );
  }
  if (app.kind === 'weather') return <WeatherPanel app={app} mode={mode} />;
  if (app.kind === 'clock') return <ClockPanel app={app} mode={mode} />;
  return <WebsiteFrame url={app.url} title={title} mode={mode} />;
}

function YouTubeFrame({
  app,
  title,
  mode,
  loopPlayback,
  onPlaybackComplete,
}: {
  app: Extract<SignageApp, { kind: 'youtube' }>;
  title: string;
  mode: Props['mode'];
  loopPlayback: boolean;
  onPlaybackComplete?: () => void;
}) {
  const iframeIdRef = useRef(`youtube-player-${Math.random().toString(36).slice(2)}`);
  const isThumbnail = mode === 'thumbnail';
  const params = new URLSearchParams({
    autoplay: isThumbnail ? '0' : '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    rel: '0',
    enablejsapi: '1',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    modestbranding: '1',
  });
  if (loopPlayback) {
    params.set('loop', '1');
    params.set('playlist', app.videoId);
  }
  const source = `https://www.youtube.com/embed/${encodeURIComponent(app.videoId)}?${params.toString()}`;

  useEffect(() => {
    if (mode !== 'player' || !onPlaybackComplete) return;

    let player: { destroy?: () => void } | null = null;
    let cancelled = false;
    let retryId: number | null = null;

    function attachPlayer() {
      const yt = (window as unknown as { YT?: { Player?: new (id: string, options: unknown) => { destroy?: () => void }; PlayerState?: { ENDED: number } } }).YT;

      if (!yt?.Player || !yt.PlayerState) {
        retryId = window.setTimeout(attachPlayer, 250);
        return;
      }

      if (cancelled) return;
      player = new yt.Player(iframeIdRef.current, {
        events: {
          onStateChange: (event: { data: number }) => {
            if (!loopPlayback && event.data === yt.PlayerState?.ENDED) {
              onPlaybackComplete?.();
            }
          },
        },
      });
    }

    if (!(window as unknown as { YT?: unknown }).YT) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }

    attachPlayer();

    return () => {
      cancelled = true;
      if (retryId) window.clearTimeout(retryId);
      player?.destroy?.();
    };
  }, [app.videoId, loopPlayback, mode, onPlaybackComplete]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <iframe
        id={iframeIdRef.current}
        className={`h-full w-full ${mode === 'player' ? 'pointer-events-none' : ''}`}
        src={source}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      {isThumbnail && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Youtube className="h-10 w-10 text-red-300" />
        </div>
      )}
    </div>
  );
}

function WeatherPanel({ app, mode }: { app: Extract<SignageApp, { kind: 'weather' }>; mode: Props['mode'] }) {
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadWeather() {
      try {
        const endpoint = new URL('https://api.open-meteo.com/v1/forecast');
        endpoint.searchParams.set('latitude', String(app.latitude));
        endpoint.searchParams.set('longitude', String(app.longitude));
        endpoint.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
        endpoint.searchParams.set('timezone', 'auto');

        const response = await fetch(endpoint.toString());
        if (!response.ok) throw new Error(`Weather failed with status ${response.status}.`);
        const payload = (await response.json()) as WeatherPayload;
        if (isMounted) {
          setWeather(payload);
          setError('');
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Weather is unavailable.');
        }
      }
    }

    loadWeather();
    const intervalId = window.setInterval(loadWeather, 15 * 60 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [app.latitude, app.longitude]);

  const temperature = weather?.current?.temperature_2m;
  const wind = weather?.current?.wind_speed_10m;
  const large = mode === 'player';

  return (
    <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-sky-950 via-slate-950 to-emerald-950 p-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-cyan-100/80">Weather</p>
          <h3 className={`${large ? 'text-5xl' : 'text-xl'} font-semibold`}>{app.name}</h3>
        </div>
        <CloudSun className={large ? 'h-20 w-20 text-amber-200' : 'h-9 w-9 text-amber-200'} />
      </div>
      <div>
        {error ? (
          <p className="rounded-lg bg-rose-500/20 px-3 py-2 text-sm text-rose-100">{error}</p>
        ) : (
          <>
            <p className={`${large ? 'text-8xl' : 'text-4xl'} font-semibold`}>{temperature ?? '--'}°C</p>
            <p className="mt-2 text-sm text-slate-200">Wind {wind ?? '--'} km/h</p>
          </>
        )}
      </div>
    </div>
  );
}

function ClockPanel({ app, mode }: { app: Extract<SignageApp, { kind: 'clock' }>; mode: Props['mode'] }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const large = mode === 'player';

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-950 p-5 text-center text-white">
      <Clock3 className={large ? 'mb-6 h-20 w-20 text-cyan-200' : 'mb-3 h-9 w-9 text-cyan-200'} />
      <p className="mb-2 text-sm uppercase tracking-wide text-slate-400">{app.label}</p>
      <p className={`${large ? 'text-8xl' : 'text-4xl'} font-semibold`}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      {large && <p className="mt-4 text-2xl text-slate-300">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
    </div>
  );
}

function WebsiteFrame({ url, title, mode }: { url: string; title: string; mode: Props['mode'] }) {
  if (mode === 'thumbnail') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-950 p-4 text-center text-white">
        <Globe2 className="mb-3 h-9 w-9 text-cyan-200" />
        <p className="max-h-10 overflow-hidden text-sm font-medium">{title}</p>
      </div>
    );
  }

  return <iframe className="h-full w-full border-0 bg-white" src={url} title={title} allow="autoplay; fullscreen" />;
}
