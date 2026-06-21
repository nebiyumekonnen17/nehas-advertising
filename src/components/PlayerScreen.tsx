import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, MonitorPlay } from 'lucide-react';
import AppContent from './AppContent';
import TemplateRenderer from './TemplateRenderer';
import { useAppSettings } from '../hooks/useAppSettings';
import { parseSignageApp } from '../lib/apps';
import { appendCacheSignature } from '../lib/media';
import { supabase } from '../lib/supabase';
import { isWithinWindow } from '../lib/time';
import type { PlaylistItem, Screen, ScreenTemplate, ScreenTemplateZone } from '../types';

const PLAYER_VERSION = 'web-player-0.1.0';
const TEMPLATE_ZONE_SELECT =
  'id, template_id, zone_key, media_id, playlist_id, fit_mode, background_color, sort_order, x, y, width, height, z_index, border_radius, media(id, file_name, file_url, media_type, created_at), playlist:playlists(id, name, created_at, playlist_items(id, screen_id, playlist_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)))';

type ActiveTemplate = {
  template: ScreenTemplate;
  zones: ScreenTemplateZone[];
};

type Props = {
  screenId: string;
  onNavigate: (path: string) => void;
};

function getPlaylistSignature(items: PlaylistItem[]) {
  return items
    .map((item) =>
      [
        item.id,
        item.media_id,
        item.display_order,
        item.duration_seconds,
        item.duration,
        item.start_time,
        item.end_time,
        item.media?.file_url,
        item.media?.created_at,
      ].join(':'),
    )
    .join('|');
}

function getTemplateSignature(activeTemplate: ActiveTemplate | null) {
  return activeTemplate
    ? [
        activeTemplate.template.id,
        activeTemplate.template.layout_type,
        ...activeTemplate.zones.map((zone) =>
          [
            zone.id,
            zone.zone_key,
            zone.media_id,
            zone.fit_mode,
            zone.background_color,
            zone.x,
            zone.y,
            zone.width,
            zone.height,
            zone.z_index,
            zone.border_radius,
            zone.media?.file_url,
            zone.media?.created_at,
            zone.playlist_id,
            zone.playlist?.playlist_items
              ?.map((item) => `${item.id}:${item.media_id}:${item.display_order}:${item.duration_seconds}:${item.media?.file_url}`)
              .join(','),
          ].join(':'),
        ),
      ].join('|')
    : '';
}

export default function PlayerScreen({ screenId, onNavigate }: Props) {
  const { settings } = useAppSettings();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ActiveTemplate | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [failedItemIds, setFailedItemIds] = useState<Set<string>>(() => new Set());
  const manifestRequestIdRef = useRef(0);

  const activeItems = useMemo(
    () =>
      items
        .filter((item) => item.media && !failedItemIds.has(item.id) && isWithinWindow(item.start_time, item.end_time))
        .sort((a, b) => a.display_order - b.display_order),
    [failedItemIds, items],
  );

  const currentItem = activeItems[currentIndex % Math.max(activeItems.length, 1)] ?? null;
  const nextItem = activeItems[(currentIndex + 1) % Math.max(activeItems.length, 1)] ?? null;
  const playlistSignature = useMemo(() => getPlaylistSignature(items), [items]);
  const templateSignature = useMemo(() => getTemplateSignature(activeTemplate), [activeTemplate]);
  const advanceToNextItem = useCallback(() => {
    setCurrentIndex((index) => (index + 1) % Math.max(activeItems.length, 1));
    setPlaybackCycle((cycle) => cycle + 1);
  }, [activeItems.length]);

  const updatePlayerPresence = useCallback(async () => {
    if (!supabase) return;

    await supabase
      .from('screens')
      .update({
        last_seen: new Date().toISOString(),
        is_paired: true,
      })
      .eq('id', screenId);
  }, [screenId]);

  const updatePlayerHealth = useCallback(
    async (patch: Partial<Screen>) => {
      if (!supabase) return;

      await supabase
        .from('screens')
        .update({
          last_seen: new Date().toISOString(),
          is_paired: true,
          player_version: PLAYER_VERSION,
          ...patch,
        })
        .eq('id', screenId);
    },
    [screenId],
  );

  const loadManifest = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setIsLoading(false);
      return;
    }

    const requestId = ++manifestRequestIdRef.current;

    try {
      const [screenResponse, itemsResponse] = await Promise.all([
        supabase.from('screens').select('*').eq('id', screenId).maybeSingle(),
        supabase
          .from('playlist_items')
          .select(
            'id, screen_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)',
          )
          .eq('screen_id', screenId)
          .order('display_order', { ascending: true }),
      ]);

      if (screenResponse.error) throw screenResponse.error;
      if (itemsResponse.error) throw itemsResponse.error;
      if (requestId !== manifestRequestIdRef.current) return;
      if (!screenResponse.data) {
        setError('This screen does not exist.');
        setScreen(null);
        setItems([]);
        return;
      }

      setScreen(screenResponse.data as Screen);
      let nextItems = (itemsResponse.data ?? []) as unknown as PlaylistItem[];
      try {
        const playlistAssignment = await supabase
          .from('screen_playlist_assignments')
          .select('playlist_id')
          .eq('screen_id', screenId)
          .maybeSingle();

        if (!playlistAssignment.error && playlistAssignment.data?.playlist_id) {
          const reusableItems = await supabase
            .from('playlist_items')
            .select('id, screen_id, playlist_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)')
            .eq('playlist_id', playlistAssignment.data.playlist_id)
            .order('display_order', { ascending: true });
          if (!reusableItems.error) {
            nextItems = (reusableItems.data ?? []) as unknown as PlaylistItem[];
          }
        }
      } catch {
        // Reusable playlists are optional until their migration is installed.
      }
      setItems((current) =>
        getPlaylistSignature(current) === getPlaylistSignature(nextItems) ? current : nextItems,
      );

      let nextTemplate: ActiveTemplate | null = null;
      try {
        const assignmentResponse = await supabase
          .from('screen_template_assignments')
          .select('*')
          .eq('screen_id', screenId)
          .eq('active', true)
          .maybeSingle();

        if (!assignmentResponse.error && assignmentResponse.data?.template_id) {
          const [templateResponse, zonesResponse] = await Promise.all([
            supabase.from('screen_templates').select('*').eq('id', assignmentResponse.data.template_id).maybeSingle(),
            supabase
              .from('screen_template_zones')
              .select(TEMPLATE_ZONE_SELECT)
              .eq('template_id', assignmentResponse.data.template_id)
              .order('sort_order', { ascending: true }),
          ]);

          if (!templateResponse.error && !zonesResponse.error && templateResponse.data) {
            nextTemplate = {
              template: templateResponse.data as ScreenTemplate,
              zones: (zonesResponse.data ?? []) as unknown as ScreenTemplateZone[],
            };
          }
        }
      } catch {
        nextTemplate = null;
      }

      if (requestId !== manifestRequestIdRef.current) return;
      setActiveTemplate((current) =>
        getTemplateSignature(current) === getTemplateSignature(nextTemplate) ? current : nextTemplate,
      );
      setError('');
    } catch (nextError) {
      if (requestId === manifestRequestIdRef.current) {
        setError(nextError instanceof Error ? nextError.message : 'Could not load playback.');
      }
    } finally {
      if (requestId === manifestRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [screenId]);

  const heartbeat = useCallback(async () => {
    try {
      await updatePlayerPresence();
    } catch {
      // A transient heartbeat failure should not stop playback.
    }

    try {
      const healthPatch: Partial<Screen> = {
        player_status: error ? 'error' : activeTemplate ? 'template' : activeItems.length === 0 ? 'empty' : currentItem?.media ? 'playing' : 'idle',
        current_media_id: activeTemplate ? null : currentItem?.media_id ?? null,
        player_message: error
          ? 'Player has an active error'
          : activeTemplate
            ? `Showing template ${activeTemplate.template.name}`
          : currentItem?.media
            ? `Playing ${currentItem.media.file_name}`
            : 'No active media for this time window',
      };

      if (error) {
        healthPatch.player_error = error;
      }

      await updatePlayerHealth(healthPatch);
    } catch {
      // Keep playback running even if a transient network issue blocks the heartbeat.
    }
  }, [activeItems.length, activeTemplate, currentItem, error, updatePlayerHealth, updatePlayerPresence]);

  const checkReloadCommand = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data, error: commandError } = await supabase
        .from('screens')
        .select('reload_requested_at, reload_acknowledged_at')
        .eq('id', screenId)
        .maybeSingle();

      if (commandError) throw commandError;
      const requestedAt = data?.reload_requested_at ? new Date(data.reload_requested_at).getTime() : 0;
      const acknowledgedAt = data?.reload_acknowledged_at ? new Date(data.reload_acknowledged_at).getTime() : 0;

      if (requestedAt > 0 && requestedAt > acknowledgedAt) {
        await updatePlayerHealth({
          player_status: 'reloading',
          player_message: 'Reload command acknowledged',
          player_error: null,
          reload_acknowledged_at: new Date().toISOString(),
        });
        window.location.reload();
      }
    } catch {
      // Remote reload checks should never interrupt playback.
    }
  }, [screenId, updatePlayerHealth]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      loadManifest();
    }, 30_000);

    const handleVisibility = () => {
      if (!document.hidden) loadManifest();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(refreshId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadManifest]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel(`player-sync-${screenId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_items' }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_playlist_assignments', filter: `screen_id=eq.${screenId}` }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_template_assignments', filter: `screen_id=eq.${screenId}` }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_templates' }, () => {
        loadManifest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_template_zones' }, () => {
        loadManifest();
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadManifest, screenId]);

  useEffect(() => {
    heartbeat();
    const heartbeatId = window.setInterval(() => {
      heartbeat();
    }, 30_000);

    return () => {
      window.clearInterval(heartbeatId);
    };
  }, [heartbeat]);

  useEffect(() => {
    checkReloadCommand();
    const reloadCommandId = window.setInterval(() => {
      checkReloadCommand();
    }, 10_000);

    return () => {
      window.clearInterval(reloadCommandId);
    };
  }, [checkReloadCommand]);

  useEffect(() => {
    setCurrentIndex(0);
    setPlaybackCycle(0);
    setFailedItemIds(new Set());
  }, [playlistSignature]);

  function skipFailedItem(itemId: string) {
    const failedItem = activeItems.find((item) => item.id === itemId);
    updatePlayerHealth({
      player_status: 'error',
      current_media_id: failedItem?.media_id ?? null,
      player_message: 'Skipping failed media',
      player_error: `Failed to load ${failedItem?.media?.file_name ?? 'media item'}`,
    }).catch(() => undefined);

    setFailedItemIds((current) => {
      const next = new Set(current);
      next.add(itemId);
      return next;
    });
    setCurrentIndex((index) => (activeItems.length > 1 ? (index + 1) % activeItems.length : 0));
  }

  useEffect(() => {
    if (activeItems.length === 0 || !currentItem?.media) return;

    const currentApp = currentItem.media.media_type === 'url' ? parseSignageApp(currentItem.media.file_url) : null;
    if (currentItem.media.media_type === 'video' || currentApp?.kind === 'youtube') {
      return;
    }

    const duration = Math.max(
      1,
      currentItem.duration_seconds ?? currentItem.duration ?? settings.defaultItemDurationSeconds,
    );
    const timeoutId = window.setTimeout(() => {
      advanceToNextItem();
    }, duration * 1000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeItems.length, advanceToNextItem, currentItem, settings.defaultItemDurationSeconds]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-300" />
      </main>
    );
  }

  if (error || !screen) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <section className="w-full max-w-xl rounded-lg border border-rose-400/30 bg-slate-950 p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-rose-300" />
          <h1 className="mb-2 text-2xl font-semibold">Player cannot start</h1>
          <p className="mb-5 text-slate-300">{error || 'Screen record was not found.'}</p>
          <button onClick={() => onNavigate('/player')} className="rounded-lg bg-cyan-300 px-4 py-3 font-semibold text-slate-950" type="button">
            Pair again
          </button>
        </section>
      </main>
    );
  }

  if (activeTemplate) {
    return (
      <PlayerShell screen={screen} settings={settings}>
        <TemplateRenderer key={templateSignature} template={activeTemplate.template} zones={activeTemplate.zones} mode="player" />
      </PlayerShell>
    );
  }

  if (activeItems.length === 0 || !currentItem?.media) {
    return (
      <PlayerShell screen={screen} settings={settings}>
        <PlayerFallback settings={settings} title="No active media" message="Add playlist items in the console or adjust the start and end time windows." />
      </PlayerShell>
    );
  }

  const currentMedia = currentItem.media;
  const signature = `${currentItem.id}-${currentMedia.created_at ?? ''}`;
  const source = appendCacheSignature(currentMedia.file_url, signature);

  return (
    <PlayerShell screen={screen} settings={settings}>
      {currentMedia.media_type === 'url' ? (
        <AppContent
          key={`${currentItem.id}-${playbackCycle}`}
          url={currentMedia.file_url}
          title={currentMedia.file_name}
          mode="player"
          loopPlayback={activeItems.length === 1}
          onPlaybackComplete={advanceToNextItem}
        />
      ) : currentMedia.media_type === 'video' ? (
        <video
          key={`${source}-${playbackCycle}`}
          className={`h-full w-full bg-black ${settings.playerFitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
          src={source}
          autoPlay
          loop={activeItems.length === 1}
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = 0;
            event.currentTarget.play().catch(() => undefined);
          }}
          onEnded={advanceToNextItem}
          onError={() => skipFailedItem(currentItem.id)}
        />
      ) : (
        <img
          key={`${source}-${playbackCycle}`}
          className={`h-full w-full bg-black ${settings.playerFitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
          src={source}
          alt={currentMedia.file_name}
          onError={() => skipFailedItem(currentItem.id)}
        />
      )}
      {nextItem?.media?.media_type !== 'video' && nextItem?.media && (
        <img
          className="pointer-events-none absolute h-1 w-1 opacity-0"
          src={appendCacheSignature(nextItem.media.file_url, `${nextItem.id}-${nextItem.media.created_at ?? ''}`)}
          alt=""
          aria-hidden="true"
        />
      )}
    </PlayerShell>
  );
}

function PlayerShell({
  screen,
  settings,
  children,
}: {
  screen: Screen;
  settings: ReturnType<typeof useAppSettings>['settings'];
  children: ReactNode;
}) {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      {children}
      <footer className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1000] grid min-h-10 gap-1 bg-black/80 px-5 py-2 text-xs text-white backdrop-blur-sm md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-3 md:text-sm">
        <div className="truncate">Player: {screen.name ?? 'New-Player'}</div>
        <div className="truncate text-center font-medium">{settings.playerFooterText}</div>
        <div className="truncate text-left md:text-right">This system Designed By Nebiyu Mekonnen</div>
      </footer>
    </main>
  );
}

function PlayerFallback({
  settings,
  title,
  message,
}: {
  settings: ReturnType<typeof useAppSettings>['settings'];
  title: string;
  message: string;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center bg-slate-950 bg-cover bg-center px-6 text-center"
      style={{ backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.38), rgba(2, 6, 23, 0.78)), url("${settings.playerBackgroundUrl}")` }}
    >
      <MonitorPlay className="mb-5 h-16 w-16 text-cyan-100" />
      <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-cyan-100">{settings.brandName}</p>
      <h1 className="mb-3 max-w-4xl text-4xl font-semibold text-white md:text-6xl">{title}</h1>
      <p className="max-w-2xl text-lg text-slate-100 md:text-2xl">{message}</p>
    </div>
  );
}
