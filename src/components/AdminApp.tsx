import { Component, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Clock3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clipboard,
  CloudSun,
  Film,
  Image,
  Library,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  Monitor,
  MonitorPlay,
  Plus,
  RefreshCw,
  ScreenShare,
  Save,
  Settings,
  SplitSquareHorizontal,
  Trash2,
  UploadCloud,
  Wifi,
  WifiOff,
  X,
  Youtube,
} from 'lucide-react';
import { useSignageData } from '../hooks/useSignageData';
import { useAppSettings } from '../hooks/useAppSettings';
import AppContent from './AppContent';
import TemplateRenderer from './TemplateRenderer';
import {
  createClockAppUrl,
  createWeatherAppUrl,
  createWebsiteAppUrl,
  createYouTubeAppUrl,
  extractYouTubeVideoId,
  normalizeWebsiteUrl,
  parseSignageApp,
  resolveWeatherLocation,
} from '../lib/apps';
import {
  appendCacheSignature,
  getSupabaseStoragePath,
  inferMediaType,
  removeFromSupabaseStorage,
  uploadToSupabaseStorage,
} from '../lib/media';
import { getDefaultPlaylistDuration } from '../lib/durations';
import { getTemplateLayout, TEMPLATE_LAYOUTS } from '../lib/templates';
import { supabase } from '../lib/supabase';
import type { AppSettings } from '../lib/settings';
import { formatRelativeLastSeen, isOnline, isWithinWindow } from '../lib/time';
import {
  compressVideoForUpload,
  formatFileSize,
  VIDEO_COMPRESSION_THRESHOLD_BYTES,
} from '../lib/videoCompression';
import type {
  Campaign,
  CampaignItem,
  CampaignScreen,
  Media,
  Playlist,
  PlaylistItem,
  Screen,
  ScreenPlaylistAssignment,
  ScreenTemplate,
  ScreenTemplateAssignment,
  ScreenTemplateZone,
  TemplateLayoutType,
} from '../types';

type Props = {
  session: Session;
  onNavigate: (path: string) => void;
};

type View = 'screens' | 'media' | 'playlists' | 'campaigns' | 'templates' | 'preview' | 'settings';

const TEMPLATE_ZONE_SELECT =
  'id, template_id, zone_key, media_id, playlist_id, fit_mode, background_color, sort_order, x, y, width, height, z_index, border_radius, media(id, file_name, file_url, media_type, created_at), playlist:playlists(id, name, created_at, playlist_items(id, screen_id, playlist_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)))';

function randomPairingCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sortPlaylist(items: PlaylistItem[]) {
  return [...items].sort((a, b) => a.display_order - b.display_order);
}

const SAMPLE_TEMPLATE_MEDIA: Record<'image' | 'imageAlt' | 'video' | 'youtube' | 'weather' | 'clock', Media> = {
  image: {
    id: 'sample-image',
    file_name: 'Sample photo - Pexels rocks',
    file_url: 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    media_type: 'image',
    created_at: null,
  },
  imageAlt: {
    id: 'sample-image-alt',
    file_name: 'Sample photo - Pexels landscape',
    file_url: 'https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    media_type: 'image',
    created_at: null,
  },
  video: {
    id: 'sample-video',
    file_name: 'Sample video - Big Buck Bunny',
    file_url: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    media_type: 'video',
    created_at: null,
  },
  youtube: {
    id: 'sample-youtube',
    file_name: 'Sample app - YouTube Big Buck Bunny',
    file_url: createYouTubeAppUrl('aqz-KE-bpKQ'),
    media_type: 'url',
    created_at: null,
  },
  weather: {
    id: 'sample-weather',
    file_name: 'Sample app - Weather Addis Ababa',
    file_url: createWeatherAppUrl({ name: 'Addis Ababa, Ethiopia', latitude: 9.03, longitude: 38.74 }),
    media_type: 'url',
    created_at: null,
  },
  clock: {
    id: 'sample-clock',
    file_name: 'Sample app - Clock',
    file_url: createClockAppUrl('Nehas Advertising'),
    media_type: 'url',
    created_at: null,
  },
};

function templateSlotFor(layoutType: TemplateLayoutType, zoneKey: string, index: number): keyof typeof SAMPLE_TEMPLATE_MEDIA {
  if (layoutType === 'full') return 'video';
  if (layoutType === 'split') return index === 0 ? 'youtube' : 'image';
  if (layoutType === 'sidebar') return zoneKey === 'sidebar' ? 'weather' : 'imageAlt';
  if (layoutType === 'grid') return (['youtube', 'image', 'weather', 'clock'] as const)[index] ?? 'image';
  if (layoutType === 'banner') return zoneKey === 'banner' ? 'clock' : 'image';
  if (layoutType === 'canvas') return (['youtube', 'image', 'weather'] as const)[index] ?? 'imageAlt';
  return 'image';
}

function findSeededMedia(media: Media[], slot: keyof typeof SAMPLE_TEMPLATE_MEDIA): Media | null {
  const sample = SAMPLE_TEMPLATE_MEDIA[slot];
  return (
    media.find((asset) => asset.file_url === sample.file_url) ??
    media.find((asset) => asset.file_name === sample.file_name) ??
    null
  );
}

function getTemplatePreviewZones(layoutType: TemplateLayoutType): ScreenTemplateZone[] {
  if (layoutType === 'canvas') {
    return [
      buildPreviewZone('zone_1', SAMPLE_TEMPLATE_MEDIA.youtube, { x: 4, y: 6, width: 58, height: 58, z_index: 1, border_radius: 12 }),
      buildPreviewZone('zone_2', SAMPLE_TEMPLATE_MEDIA.image, { x: 62, y: 10, width: 34, height: 40, z_index: 2, border_radius: 12 }),
      buildPreviewZone('zone_3', SAMPLE_TEMPLATE_MEDIA.weather, { x: 18, y: 62, width: 42, height: 30, z_index: 3, border_radius: 12 }),
    ];
  }

  const layout = getTemplateLayout(layoutType);
  return layout.zones.map((zone, index) =>
    buildPreviewZone(zone.key, SAMPLE_TEMPLATE_MEDIA[templateSlotFor(layoutType, zone.key, index)], {
      sort_order: index + 1,
    }),
  );
}

function buildPreviewZone(
  key: string,
  media: Media,
  overrides: Partial<ScreenTemplateZone> = {},
): ScreenTemplateZone {
  return {
    id: `preview-${key}`,
    template_id: 'preview',
    zone_key: key,
    media_id: media.id,
    fit_mode: 'cover',
    background_color: '#020617',
    sort_order: overrides.sort_order ?? 1,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 50,
    height: overrides.height ?? 50,
    z_index: overrides.z_index ?? 1,
    border_radius: overrides.border_radius ?? 8,
    media,
  };
}

function buildStarterTemplateZoneRows(layoutType: TemplateLayoutType, templateId: string, media: Media[]) {
  if (layoutType === 'canvas') {
    const canvasZones = [
      { key: 'zone_1', slot: 'youtube' as const, x: 4, y: 6, width: 58, height: 58, z_index: 1 },
      { key: 'zone_2', slot: 'image' as const, x: 62, y: 10, width: 34, height: 40, z_index: 2 },
      { key: 'zone_3', slot: 'weather' as const, x: 18, y: 62, width: 42, height: 30, z_index: 3 },
    ];

    return canvasZones.map((zone, index) => ({
      template_id: templateId,
      zone_key: zone.key,
      media_id: findSeededMedia(media, zone.slot)?.id ?? null,
      sort_order: index + 1,
      fit_mode: 'cover',
      background_color: '#020617',
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      z_index: zone.z_index,
      border_radius: 12,
    }));
  }

  return getTemplateLayout(layoutType).zones.map((zone, index) => {
    const slot = templateSlotFor(layoutType, zone.key, index);
    return {
      template_id: templateId,
      zone_key: zone.key,
      media_id: findSeededMedia(media, slot)?.id ?? null,
      sort_order: index + 1,
      fit_mode: slot === 'clock' || slot === 'weather' ? 'contain' : 'cover',
      background_color: '#020617',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      z_index: index + 1,
      border_radius: 0,
    };
  });
}

export default function AdminApp({ session, onNavigate }: Props) {
  const data = useSignageData();
  const settingsState = useAppSettings();
  const [view, setView] = useState<View>('screens');

  const activeItems = useMemo(
    () => sortPlaylist(data.playlistItems).filter((item) => item.media && isWithinWindow(item.start_time, item.end_time)),
    [data.playlistItems],
  );

  async function signOut() {
    try {
      await supabase?.auth.signOut();
      onNavigate('/login');
    } catch {
      data.notify({ tone: 'error', message: 'Could not sign out.' });
    }
  }

  const onlineCount = data.screens.filter((screen) => isOnline(screen.last_seen)).length;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-300">
              <ScreenShare className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">{settingsState.settings.brandName}</p>
              <h1 className="text-xl font-semibold text-white">
                {settingsState.settings.brandName} ({settingsState.settings.brandSubtitle})
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Metric label="Screens" value={data.screens.length} />
            <Metric label="Online" value={onlineCount} tone="emerald" />
            <Metric label="Media" value={data.media.length} />
            <button
              onClick={() => data.refreshAll()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100"
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              onClick={signOut}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 transition hover:border-rose-300 hover:text-rose-100"
              type="button"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <aside className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 shadow-panel">
          <p className="px-3 py-2 text-xs uppercase tracking-wide text-slate-500">{session.user.email}</p>
          <nav className="space-y-1">
            <NavButton active={view === 'screens'} icon={<Monitor />} label="Screens" onClick={() => setView('screens')} />
            <NavButton active={view === 'media'} icon={<Library />} label="Media" onClick={() => setView('media')} />
            <NavButton active={view === 'playlists'} icon={<Clock3 />} label="Playlists" onClick={() => setView('playlists')} />
            <NavButton active={view === 'campaigns'} icon={<CalendarDays />} label="Campaigns" onClick={() => setView('campaigns')} />
            <NavButton active={view === 'templates'} icon={<SplitSquareHorizontal />} label="Templates" onClick={() => setView('templates')} />
            <NavButton active={view === 'preview'} icon={<ScreenShare />} label="Preview" onClick={() => setView('preview')} />
            <NavButton active={view === 'settings'} icon={<Settings />} label="Settings" onClick={() => setView('settings')} />
          </nav>
          <button
            onClick={() => onNavigate('/player')}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-700"
            type="button"
          >
            <Link2 className="h-4 w-4" />
            Open player
          </button>
        </aside>

        <section className="min-w-0">
          {data.toast && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                data.toast.tone === 'error'
                  ? 'border-rose-400/30 bg-rose-500/12 text-rose-100'
                  : data.toast.tone === 'success'
                    ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
                    : 'border-cyan-400/30 bg-cyan-500/12 text-cyan-100'
              }`}
            >
              {data.toast.message}
            </div>
          )}

          {data.isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-800 bg-slate-900">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
            </div>
          ) : (
            <PanelErrorBoundary resetKey={view}>
              {view === 'screens' && <ScreensPanel data={data} />}
              {view === 'media' && <MediaPanel data={data} />}
              {view === 'playlists' && <PlaylistPanel data={data} settings={settingsState.settings} />}
              {view === 'campaigns' && <CampaignsPanel data={data} settings={settingsState.settings} />}
              {view === 'templates' && <TemplatesPanel data={data} />}
              {view === 'preview' && <PreviewPanel activeItems={activeItems} data={data} />}
              {view === 'settings' && <SettingsPanel data={data} settingsState={settingsState} />}
            </PanelErrorBoundary>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone = 'cyan' }: { label: string; value: number; tone?: 'cyan' | 'emerald' }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
      <span className="mr-2 text-xs text-slate-500">{label}</span>
      <span className={tone === 'emerald' ? 'font-semibold text-emerald-300' : 'font-semibold text-cyan-200'}>{value}</span>
    </div>
  );
}

class PanelErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error(error);
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-5 text-amber-100">
          <h2 className="mb-2 text-lg font-semibold">This panel could not load</h2>
          <p className="text-sm leading-6">
            {this.state.message || 'Something in this panel could not load.'} If the message mentions a missing table or policy, run the matching SQL migration. Otherwise, this is likely an app error that needs a code fix.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
        active ? 'bg-cyan-300 text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
      type="button"
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function ScreensPanel({ data }: { data: ReturnType<typeof useSignageData> }) {
  const [isAddScreenOpen, setIsAddScreenOpen] = useState(false);
  const [detailScreenId, setDetailScreenId] = useState<string | null>(null);
  const detailScreen = data.screens.find((screen) => screen.id === detailScreenId) ?? null;

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PanelTitle title="Screens" description="Pair, monitor, and manage every player in your network." />
          <button onClick={() => setIsAddScreenOpen(true)} className="primary-button sm:w-auto" type="button">
            <Plus className="h-4 w-4" />
            Add screen
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {data.screens.length === 0 ? (
            <EmptyState icon={<Monitor />} title="No screens yet" description="Create a player record, then pair a TV with its code." />
          ) : (
            data.screens.map((screen) => (
              <ScreenRow
                key={screen.id}
                active={screen.id === data.selectedScreenId}
                screen={screen}
                onSelect={() => data.setSelectedScreenId(screen.id)}
                onOpenDetails={() => {
                  data.setSelectedScreenId(screen.id);
                  setDetailScreenId(screen.id);
                }}
              />
            ))
          )}
        </div>
      </section>

      {isAddScreenOpen && (
        <AddScreenModal
          data={data}
          onClose={() => setIsAddScreenOpen(false)}
        />
      )}

      {detailScreen && (
        <ModalShell title="Screen details" onClose={() => setDetailScreenId(null)}>
          <ScreenEditor data={data} screen={detailScreen} onDeleted={() => setDetailScreenId(null)} />
        </ModalShell>
      )}
    </div>
  );
}

function AddScreenModal({ data, onClose }: { data: ReturnType<typeof useSignageData>; onClose: () => void }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function createScreen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('screens').insert({
        name: name.trim() || 'New-Player',
        location: location.trim() || null,
        pairing_code: randomPairingCode(),
        is_paired: false,
      });
      if (error) throw error;
      await data.loadScreens();
      data.notify({ tone: 'success', message: 'Screen created.' });
      onClose();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not create screen.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell title="Add screen" onClose={onClose}>
      <form onSubmit={createScreen} className="space-y-4">
        <Field label="Screen name">
          <input value={name} onChange={(event) => setName(event.target.value)} className="field" placeholder="Lobby TV" />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(event) => setLocation(event.target.value)} className="field" placeholder="Main entrance" />
        </Field>
        <button disabled={isSaving} className="primary-button w-full" type="submit">
          <Plus className="h-4 w-4" />
          {isSaving ? 'Creating...' : 'Create screen'}
        </button>
      </form>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-panel">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="icon-button" type="button" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ScreenEditor({
  data,
  screen,
  onDeleted,
}: {
  data: ReturnType<typeof useSignageData>;
  screen: Screen;
  onDeleted?: () => void;
}) {
  const [name, setName] = useState(screen.name ?? '');
  const [location, setLocation] = useState(screen.location ?? '');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(screen.name ?? '');
    setLocation(screen.location ?? '');
    setIsDeleting(false);
  }, [screen.id, screen.location, screen.name]);

  const pairingLink = `${window.location.origin}/player`;
  const directPlayerLink = `${window.location.origin}/player/${encodeURIComponent(screen.id)}`;
  const currentMedia = data.media.find((asset) => asset.id === screen.current_media_id) ?? null;

  async function copyLink(value: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement('textarea');
        try {
          textArea.value = value;
          textArea.style.position = 'fixed';
          textArea.style.left = '-9999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
      }

      data.notify({ tone: 'success', message: 'Player link copied.' });
    } catch {
      data.notify({ tone: 'error', message: 'Could not copy link. Select and copy it manually.' });
    }
  }

  async function save() {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('screens')
        .update({ name: name.trim() || 'New-Player', location: location.trim() || null })
        .eq('id', screen.id);
      if (error) throw error;
      await data.loadScreens();
      data.notify({ tone: 'success', message: 'Screen updated.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update screen.' });
    }
  }

  async function deleteScreen() {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Delete ${screen.name ?? 'this screen'} permanently? Its playlist items will also be removed.`,
    );

    if (!confirmed) return;

    const nextScreenId = data.screens.find((candidate) => candidate.id !== screen.id)?.id ?? null;
    setIsDeleting(true);

    try {
      const { error } = await supabase.from('screens').delete().eq('id', screen.id);
      if (error) throw error;

      await data.loadScreens();
      data.setSelectedScreenId(nextScreenId);
      await data.loadPlaylistItems(nextScreenId);
      data.notify({ tone: 'success', message: 'Screen deleted.' });
      onDeleted?.();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not delete screen.' });
    } finally {
      setIsDeleting(false);
    }
  }

  async function requestReload() {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('screens')
        .update({ reload_requested_at: new Date().toISOString() })
        .eq('id', screen.id);

      if (error) throw error;
      await data.loadScreens();
      data.notify({ tone: 'success', message: 'Reload command sent to the player.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not reload player.' });
    }
  }

  return (
    <div className="mt-6 border-t border-slate-800 pt-5">
      <p className="mb-4 text-sm font-semibold text-white">Selected screen</p>
      <div className="space-y-4">
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} className="field" />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(event) => setLocation(event.target.value)} className="field" />
        </Field>

        <ScreenHealthPanel screen={screen} currentMedia={currentMedia} onReload={requestReload} />

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="mb-3 text-sm font-semibold text-white">Links for the TV screen</p>
          <PlayerLinkRow label="Pairing page" value={pairingLink} onCopy={() => copyLink(pairingLink)} />
          <PlayerLinkRow label="Direct player" value={directPlayerLink} onCopy={() => copyLink(directPlayerLink)} />
        </div>

        <button onClick={save} className="secondary-button w-full" type="button">
          Save details
        </button>
        <button
          onClick={deleteScreen}
          disabled={isDeleting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
          {isDeleting ? 'Deleting...' : 'Delete screen'}
        </button>
      </div>
    </div>
  );
}

function ScreenHealthPanel({
  screen,
  currentMedia,
  onReload,
}: {
  screen: Screen;
  currentMedia: Media | null;
  onReload: () => void;
}) {
  const online = isOnline(screen.last_seen);
  const reloadPending = Boolean(
    screen.reload_requested_at &&
      (!screen.reload_acknowledged_at ||
        new Date(screen.reload_requested_at).getTime() > new Date(screen.reload_acknowledged_at).getTime()),
  );

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-300" />
          <p className="text-sm font-semibold text-white">Screen health</p>
        </div>
        <button onClick={onReload} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-cyan-300 hover:text-cyan-100" type="button">
          <RefreshCw className="h-3.5 w-3.5" />
          Reload player
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Status online={online} />
        {screen.is_paired ? <Badge text="Paired" /> : <Badge text="Waiting" tone="amber" />}
        {reloadPending && <Badge text="Reload pending" tone="amber" />}
      </div>

      <div className="grid gap-2 text-sm">
        <HealthLine label="Last seen" value={formatRelativeLastSeen(screen.last_seen)} />
        <HealthLine label="Status" value={screen.player_status ?? 'idle'} />
        <HealthLine label="Current media" value={currentMedia?.file_name ?? 'None'} />
        <HealthLine label="Message" value={screen.player_message ?? 'No player message'} />
        <HealthLine label="Version" value={screen.player_version ?? 'Unknown'} />
      </div>

      {screen.player_error && (
        <div className="mt-3 flex gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{screen.player_error}</span>
        </div>
      )}
    </div>
  );
}

function HealthLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 rounded-lg bg-slate-900 px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-slate-200">{value}</span>
    </div>
  );
}

function PlayerLinkRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-cyan-300 hover:text-cyan-100"
          type="button"
        >
          <Clipboard className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <p className="break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-cyan-100">{value}</p>
    </div>
  );
}

function ScreenRow({
  active,
  screen,
  onSelect,
  onOpenDetails,
}: {
  active: boolean;
  screen: Screen;
  onSelect: () => void;
  onOpenDetails: () => void;
}) {
  const online = isOnline(screen.last_seen);
  return (
    <article
      className={`grid gap-3 rounded-lg border p-4 transition md:grid-cols-[1fr_auto] ${
        active ? 'border-cyan-300 bg-cyan-300/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'
      }`}
    >
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-white">{screen.name ?? 'New-Player'}</h3>
          <Status online={online} />
          {screen.is_paired ? <Badge text="Paired" /> : <Badge text="Waiting" tone="amber" />}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-400">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {screen.location || 'No location'}
          </span>
          <span>{formatRelativeLastSeen(screen.last_seen)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:min-w-44">
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center">
          <p className="text-xs text-slate-500">Pairing code</p>
          <p className="font-mono text-lg font-semibold text-cyan-100">{screen.pairing_code ?? '000000'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSelect} className="secondary-button py-2" type="button">
            Select
          </button>
          <button onClick={onOpenDetails} className="primary-button py-2" type="button">
            Details
          </button>
        </div>
      </div>
    </article>
  );
}

function MediaPanel({ data }: { data: ReturnType<typeof useSignageData> }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  async function handleFile(file: File | undefined) {
    if (!file || !supabase) return;
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setPreviewType(inferMediaType(file));
    setIsUploading(true);
    setUploadStatus('Preparing upload...');

    try {
      let uploadFile = file;
      if (inferMediaType(file) === 'video' && file.size > VIDEO_COMPRESSION_THRESHOLD_BYTES) {
        setUploadStatus(`Compressing ${formatFileSize(file.size)} video...`);
        uploadFile = await compressVideoForUpload(file, (progress) => {
          setUploadStatus(`Compressing video... ${progress}%`);
        });
      }

      setUploadStatus(`Uploading ${formatFileSize(uploadFile.size)}...`);
      const uploaded = await uploadToSupabaseStorage(uploadFile);
      const { error } = await supabase.from('media').insert({
        file_name: uploadFile.name,
        file_url: uploaded.publicUrl,
        media_type: inferMediaType(uploadFile),
      });

      if (error) {
        try {
          await removeFromSupabaseStorage(uploaded.path);
        } catch {
          // Keep the original database error visible to the operator.
        }
        throw error;
      }
      await data.loadMedia();
      data.notify({
        tone: 'success',
        message:
          uploadFile === file
            ? 'Media uploaded.'
            : `Video compressed from ${formatFileSize(file.size)} to ${formatFileSize(uploadFile.size)} and uploaded.`,
      });
    } catch (error) {
      data.notify({ tone: 'error', message: explainUploadError(error) });
    } finally {
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
      setPreviewType(null);
      setIsUploading(false);
      setUploadStatus('');
    }
  }

  async function deleteMedia(asset: Media) {
    if (!supabase) return;

    const confirmed = window.confirm(
      `Delete ${asset.file_name}? This will also remove it from any screen playlists.`,
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.from('media').delete().eq('id', asset.id);
      if (error) throw error;

      const storagePath = getSupabaseStoragePath(asset.file_url);
      let cleanupFailed = false;

      if (storagePath) {
        try {
          await removeFromSupabaseStorage(storagePath);
        } catch {
          cleanupFailed = true;
        }
      }

      await data.loadMedia();
      await data.loadPlaylistItems();
      data.notify({
        tone: cleanupFailed ? 'info' : 'success',
        message: cleanupFailed
          ? 'Media was removed from the library, but the Storage file could not be deleted.'
          : 'Media deleted.',
      });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not delete media.' });
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
        <PanelTitle title="Upload media" description="Images and videos are stored in Supabase Storage, then registered in the media table." />
        <label className="mt-5 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-600 bg-slate-950/70 px-5 text-center transition hover:border-cyan-300">
          <UploadCloud className="mb-3 h-9 w-9 text-cyan-300" />
          <span className="font-medium text-white">{isUploading ? uploadStatus : 'Choose image or video'}</span>
          <span className="mt-2 text-sm text-slate-500">Videos over 45 MB are compressed before upload.</span>
          <input
            className="sr-only"
            type="file"
            accept="image/*,video/*"
            disabled={isUploading}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
        </label>
        {previewUrl && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-800 bg-black">
            {previewType === 'video' ? (
              <video className="aspect-video w-full object-contain" src={previewUrl} muted controls preload="metadata" />
            ) : (
              <img className="aspect-video w-full object-contain" src={previewUrl} alt="Upload preview" />
            )}
          </div>
        )}
        <AppCreator data={data} />
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
        <PanelTitle title="Media library" description="Use assets in screen-specific playlists." />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.media.length === 0 ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState icon={<Library />} title="No media uploaded" description="Upload your first image or video to start building playlists." />
            </div>
          ) : (
            data.media.map((asset) => <MediaCard key={asset.id} asset={asset} onDelete={() => deleteMedia(asset)} />)
          )}
        </div>
      </section>
    </div>
  );
}

function explainUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('row-level security') && normalized.includes('media')) {
    return 'The file uploaded, but the media table blocked saving the row. Add an INSERT policy for authenticated users on public.media.';
  }

  if (normalized.includes('row-level security')) {
    return 'Supabase blocked this request with row-level security. Check Storage and public.media insert policies.';
  }

  return message || 'Could not upload media.';
}

function AppCreator({ data }: { data: ReturnType<typeof useSignageData> }) {
  const [kind, setKind] = useState<'youtube' | 'weather' | 'clock' | 'website'>('youtube');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function createApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setIsSaving(true);
    try {
      let fileName = title.trim();
      let fileUrl = '';

      if (kind === 'youtube') {
        const videoId = extractYouTubeVideoId(value);
        if (!videoId) throw new Error('Enter a valid YouTube URL or video ID.');
        fileName = fileName || `YouTube - ${videoId}`;
        fileUrl = createYouTubeAppUrl(videoId);
      }

      if (kind === 'weather') {
        const location = await resolveWeatherLocation(value.trim());
        fileName = fileName || `Weather - ${location.name}`;
        fileUrl = createWeatherAppUrl(location);
      }

      if (kind === 'clock') {
        fileName = fileName || value.trim() || 'Clock';
        fileUrl = createClockAppUrl(fileName);
      }

      if (kind === 'website') {
        const websiteUrl = normalizeWebsiteUrl(value);
        fileName = fileName || new URL(websiteUrl).hostname;
        fileUrl = createWebsiteAppUrl(websiteUrl);
      }

      const { error } = await supabase.from('media').insert({
        file_name: fileName,
        file_url: fileUrl,
        media_type: 'url',
      });

      if (error) throw error;

      setTitle('');
      setValue('');
      await data.loadMedia();
      data.notify({ tone: 'success', message: 'App added to the media library.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not add app.' });
    } finally {
      setIsSaving(false);
    }
  }

  const placeholder =
    kind === 'youtube'
      ? 'https://youtube.com/watch?v=...'
      : kind === 'weather'
        ? 'Addis Ababa'
        : kind === 'website'
          ? 'https://example.com'
          : 'Lobby clock';

  return (
    <form onSubmit={createApp} className="mt-6 border-t border-slate-800 pt-5">
      <div className="mb-4 flex items-center gap-2">
        <AppWindow className="h-4 w-4 text-cyan-300" />
        <p className="text-sm font-semibold text-white">Add an app</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <AppKindButton active={kind === 'youtube'} icon={<Youtube />} label="YouTube" onClick={() => setKind('youtube')} />
        <AppKindButton active={kind === 'weather'} icon={<CloudSun />} label="Weather" onClick={() => setKind('weather')} />
        <AppKindButton active={kind === 'clock'} icon={<Clock3 />} label="Clock" onClick={() => setKind('clock')} />
        <AppKindButton active={kind === 'website'} icon={<Link2 />} label="Website" onClick={() => setKind('website')} />
      </div>

      <div className="mt-4 space-y-3">
        <Field label="Display name">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="field" placeholder="Optional" />
        </Field>
        <Field label={kind === 'clock' ? 'Clock label' : kind === 'weather' ? 'City or place' : 'Link or value'}>
          <input value={value} onChange={(event) => setValue(event.target.value)} className="field" placeholder={placeholder} required={kind !== 'clock'} />
        </Field>
        <button disabled={isSaving} className="primary-button w-full" type="submit">
          <Plus className="h-4 w-4" />
          {isSaving ? 'Adding...' : 'Add app to library'}
        </button>
      </div>
    </form>
  );
}

function AppKindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: JSX.Element;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        active ? 'border-cyan-300 bg-cyan-300 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-300'
      }`}
      type="button"
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {label}
    </button>
  );
}

function MediaCard({ asset, onDelete }: { asset: Media; onDelete: () => void }) {
  const isVideo = asset.media_type === 'video';
  const app = asset.media_type === 'url' ? parseSignageApp(asset.file_url) : null;
  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="aspect-video bg-slate-900">
        {asset.media_type === 'url' ? (
          <AppContent url={asset.file_url} title={asset.file_name} mode="thumbnail" />
        ) : isVideo ? (
          <video className="h-full w-full object-cover" src={appendCacheSignature(asset.file_url, asset.created_at ?? asset.id)} muted preload="metadata" />
        ) : (
          <img className="h-full w-full object-cover" src={appendCacheSignature(asset.file_url, asset.created_at ?? asset.id)} alt={asset.file_name} loading="lazy" />
        )}
      </div>
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-2">
            {asset.media_type === 'url' ? <AppWindow className="h-4 w-4" /> : isVideo ? <Film className="h-4 w-4" /> : <Image className="h-4 w-4" />}
            {app?.kind ?? asset.media_type ?? 'media'}
          </span>
          <button onClick={onDelete} className="text-rose-200 transition hover:text-rose-100" type="button" title="Delete media">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <h3 className="truncate text-sm font-medium text-white">{asset.file_name}</h3>
      </div>
    </article>
  );
}

function PlaylistPanel({ data, settings }: { data: ReturnType<typeof useSignageData>; settings: AppSettings }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [assignments, setAssignments] = useState<ScreenPlaylistAssignment[]>([]);
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [addingMediaId, setAddingMediaId] = useState<string | null>(null);
  const selectedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const orderedItems = sortPlaylist(items);
  const assignedScreenIds = new Set(assignments.map((assignment) => assignment.screen_id));

  const loadPlaylists = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: rows, error } = await supabase
        .from('playlists')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const next = (rows ?? []) as Playlist[];
      setPlaylists(next);
      setSelectedPlaylistId((current) =>
        current && next.some((playlist) => playlist.id === current) ? current : next[0]?.id ?? null,
      );
    } catch (error) {
      data.notify({
        tone: 'error',
        message: error instanceof Error
          ? `${error.message}. Run supabase-playlists-migration.sql.`
          : 'Could not load playlists.',
      });
    }
  }, [data]);

  const loadPlaylistDetails = useCallback(async (playlistId = selectedPlaylistId) => {
    if (!supabase || !playlistId) {
      setItems([]);
      setAssignments([]);
      return;
    }

    try {
      const [itemsResponse, assignmentsResponse] = await Promise.all([
        supabase
          .from('playlist_items')
          .select('id, screen_id, playlist_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)')
          .eq('playlist_id', playlistId)
          .order('display_order', { ascending: true }),
        supabase.from('screen_playlist_assignments').select('*').eq('playlist_id', playlistId),
      ]);
      if (itemsResponse.error) throw itemsResponse.error;
      if (assignmentsResponse.error) throw assignmentsResponse.error;
      setItems((itemsResponse.data ?? []) as unknown as PlaylistItem[]);
      setAssignments((assignmentsResponse.data ?? []) as ScreenPlaylistAssignment[]);
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not load playlist.' });
    }
  }, [data, selectedPlaylistId]);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  useEffect(() => {
    loadPlaylistDetails();
  }, [loadPlaylistDetails]);

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !name.trim()) return;
    setIsCreating(true);
    try {
      const { data: inserted, error } = await supabase
        .from('playlists')
        .insert({ name: name.trim() })
        .select('*')
        .single();
      if (error) throw error;
      setName('');
      await loadPlaylists();
      setSelectedPlaylistId((inserted as Playlist).id);
      data.notify({ tone: 'success', message: 'Playlist created.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not create playlist.' });
    } finally {
      setIsCreating(false);
    }
  }

  async function deletePlaylist() {
    if (!supabase || !selectedPlaylist) return;
    if (!window.confirm(`Delete playlist ${selectedPlaylist.name}? Its screen and template-zone assignments will be removed.`)) return;
    try {
      const { error } = await supabase.from('playlists').delete().eq('id', selectedPlaylist.id);
      if (error) throw error;
      setSelectedPlaylistId(null);
      setItems([]);
      setAssignments([]);
      await loadPlaylists();
      data.notify({ tone: 'success', message: 'Playlist deleted.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not delete playlist.' });
    }
  }

  async function addMedia(asset: Media) {
    if (!supabase || !selectedPlaylistId) return;
    const nextOrder = orderedItems.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
    setAddingMediaId(asset.id);

    try {
      const durationSeconds = await getDefaultPlaylistDuration(asset, settings);
      const { error } = await supabase.from('playlist_items').insert({
        screen_id: null,
        playlist_id: selectedPlaylistId,
        media_id: asset.id,
        display_order: nextOrder,
        duration_seconds: durationSeconds,
        duration: durationSeconds,
        start_time: '00:00',
        end_time: '23:59',
      });
      if (error) throw error;
      await loadPlaylistDetails();
      data.notify({ tone: 'success', message: 'Added media to playlist.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not add playlist item.' });
    } finally {
      setAddingMediaId(null);
    }
  }

  async function updateItem(item: PlaylistItem, patch: Partial<PlaylistItem>) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('playlist_items').update(patch).eq('id', item.id);
      if (error) throw error;
      await loadPlaylistDetails();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update playlist item.' });
    }
  }

  async function removeItem(item: PlaylistItem) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('playlist_items').delete().eq('id', item.id);
      if (error) throw error;
      await loadPlaylistDetails();
      data.notify({ tone: 'success', message: 'Playlist item removed.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not remove playlist item.' });
    }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    if (!supabase) return;
    const current = orderedItems[index];
    const next = orderedItems[index + direction];
    if (!current || !next) return;
    const temporaryOrder = -Math.floor(1 + Math.random() * 1_000_000);

    try {
      const stepOne = await supabase.from('playlist_items').update({ display_order: temporaryOrder }).eq('id', current.id);
      if (stepOne.error) throw stepOne.error;
      const stepTwo = await supabase.from('playlist_items').update({ display_order: current.display_order }).eq('id', next.id);
      if (stepTwo.error) throw stepTwo.error;
      const stepThree = await supabase.from('playlist_items').update({ display_order: next.display_order }).eq('id', current.id);
      if (stepThree.error) throw stepThree.error;
      await loadPlaylistDetails();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not reorder playlist.' });
      await loadPlaylistDetails();
    }
  }

  async function toggleScreenAssignment(screenId: string) {
    if (!supabase || !selectedPlaylistId) return;
    try {
      if (assignedScreenIds.has(screenId)) {
        const { error } = await supabase.from('screen_playlist_assignments').delete().eq('screen_id', screenId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('screen_playlist_assignments').upsert(
          { screen_id: screenId, playlist_id: selectedPlaylistId },
          { onConflict: 'screen_id' },
        );
        if (error) throw error;
      }
      await loadPlaylistDetails();
      data.notify({ tone: 'success', message: 'Screen playlist assignment updated.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not assign playlist.' });
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="Create playlist" description="Build reusable content once, then assign it anywhere." />
          <form onSubmit={createPlaylist} className="mt-4 space-y-3">
            <Field label="Playlist name">
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Lobby rotation" required />
            </Field>
            <button className="primary-button w-full" disabled={isCreating} type="submit">
              <Plus className="h-4 w-4" />
              {isCreating ? 'Creating...' : 'Create playlist'}
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="Playlists" description="Select one to edit and assign." />
          <div className="mt-4 space-y-2">
            {playlists.length === 0 ? (
              <EmptyState icon={<Clock3 />} title="No playlists" description="Create your first reusable playlist." />
            ) : playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                onClick={() => setSelectedPlaylistId(playlist.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left text-sm font-medium transition ${playlist.id === selectedPlaylistId ? 'border-cyan-300 bg-cyan-300/10 text-white' : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'}`}
              >
                {playlist.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PanelTitle title={selectedPlaylist?.name ?? 'Select a playlist'} description="Order media and set item durations." />
            {selectedPlaylist && (
              <button onClick={deletePlaylist} className="secondary-button py-2 text-rose-200" type="button">
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
          <div className="mt-5 space-y-3">
          {!selectedPlaylist ? (
            <EmptyState icon={<Clock3 />} title="No playlist selected" description="Create or select a playlist first." />
          ) : orderedItems.length === 0 ? (
            <EmptyState icon={<Clock3 />} title="Playlist is empty" description="Add media from the library to begin playback." />
          ) : (
            orderedItems.map((item, index) => (
              <PlaylistRow
                key={item.id}
                item={item}
                canMoveUp={index > 0}
                canMoveDown={index < orderedItems.length - 1}
                onMoveUp={() => moveItem(index, -1)}
                onMoveDown={() => moveItem(index, 1)}
                onRemove={() => removeItem(item)}
                onUpdate={(patch) => updateItem(item, patch)}
              />
            ))
          )}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
            <PanelTitle title="Add media" description="Add library items to this playlist." />
            <div className="mt-5 max-h-[480px] space-y-2 overflow-y-auto pr-1">
          {data.media.length === 0 ? (
            <EmptyState icon={<Library />} title="No assets" description="Upload media before adding playlist items." />
          ) : (
            data.media.map((asset) => (
              <button
                key={asset.id}
                onClick={() => addMedia(asset)}
                disabled={!selectedPlaylistId || addingMediaId === asset.id}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-left transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                {asset.media_type === 'url' ? (
                  <AppWindow className="h-4 w-4 text-emerald-300" />
                ) : asset.media_type === 'video' ? (
                  <Film className="h-4 w-4 text-amber-300" />
                ) : (
                  <Image className="h-4 w-4 text-cyan-300" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">{asset.file_name}</span>
                {addingMediaId === asset.id ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Plus className="h-4 w-4 text-slate-400" />}
              </button>
            ))
          )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
            <PanelTitle title="Assign to screens" description="Templates still take priority when active." />
            <div className="mt-5 space-y-2">
              {data.screens.length === 0 ? (
                <EmptyState icon={<Monitor />} title="No screens" description="Create a screen before assigning playlists." />
              ) : data.screens.map((screen) => (
                <label key={screen.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-cyan-300"
                    checked={assignedScreenIds.has(screen.id)}
                    disabled={!selectedPlaylistId}
                    onChange={() => toggleScreenAssignment(screen.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{screen.name ?? 'New-Player'}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function CampaignsPanel({ data, settings }: { data: ReturnType<typeof useSignageData>; settings: AppSettings }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignItems, setCampaignItems] = useState<CampaignItem[]>([]);
  const [campaignScreens, setCampaignScreens] = useState<CampaignScreen[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [addingCampaignMediaId, setAddingCampaignMediaId] = useState<string | null>(null);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null;
  const orderedCampaignItems = [...campaignItems].sort((a, b) => a.display_order - b.display_order);
  const assignedScreenIds = new Set(campaignScreens.map((assignment) => assignment.screen_id).filter(Boolean));

  const loadCampaigns = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data: rows, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const nextCampaigns = (rows ?? []) as Campaign[];
      setCampaigns(nextCampaigns);
      setSelectedCampaignId((current) => current ?? nextCampaigns[0]?.id ?? null);
    } catch (error) {
      data.notify({
        tone: 'error',
        message:
          error instanceof Error
            ? `${error.message}. Run supabase-campaigns-migration.sql if campaigns are not set up yet.`
            : 'Could not load campaigns.',
      });
    }
  }, [data]);

  const loadCampaignDetails = useCallback(
    async (campaignId = selectedCampaignId) => {
      if (!supabase || !campaignId) {
        setCampaignItems([]);
        setCampaignScreens([]);
        return;
      }

      try {
        const [itemsResponse, screensResponse] = await Promise.all([
          supabase
            .from('campaign_items')
            .select(
              'id, campaign_id, media_id, display_order, duration_seconds, start_time, end_time, media(id, file_name, file_url, media_type, created_at)',
            )
            .eq('campaign_id', campaignId)
            .order('display_order', { ascending: true }),
          supabase.from('campaign_screens').select('*').eq('campaign_id', campaignId),
        ]);

        if (itemsResponse.error) throw itemsResponse.error;
        if (screensResponse.error) throw screensResponse.error;
        setCampaignItems((itemsResponse.data ?? []) as unknown as CampaignItem[]);
        setCampaignScreens((screensResponse.data ?? []) as CampaignScreen[]);
      } catch (error) {
        data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not load campaign details.' });
      }
    },
    [data, selectedCampaignId],
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    loadCampaignDetails();
  }, [loadCampaignDetails]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSaving(true);

    try {
      const { data: inserted, error } = await supabase
        .from('campaigns')
        .insert({
          name: name.trim(),
          customer_name: customerName.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          is_active: true,
        })
        .select('*')
        .single();

      if (error) throw error;
      setName('');
      setCustomerName('');
      setStartDate('');
      setEndDate('');
      await loadCampaigns();
      setSelectedCampaignId((inserted as Campaign).id);
      data.notify({ tone: 'success', message: 'Campaign created.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not create campaign.' });
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCampaignActive(campaign: Campaign) {
    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ is_active: !campaign.is_active })
        .eq('id', campaign.id);

      if (error) throw error;
      await loadCampaigns();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update campaign.' });
    }
  }

  async function addMediaToCampaign(asset: Media) {
    if (!supabase || !selectedCampaignId) return;

    const nextOrder = orderedCampaignItems.reduce((max, item) => Math.max(max, item.display_order), 0) + 1;
    setAddingCampaignMediaId(asset.id);

    try {
      const durationSeconds = await getDefaultPlaylistDuration(asset, settings);
      const { error } = await supabase.from('campaign_items').insert({
        campaign_id: selectedCampaignId,
        media_id: asset.id,
        display_order: nextOrder,
        duration_seconds: durationSeconds,
        start_time: '00:00',
        end_time: '23:59',
      });

      if (error) throw error;
      await loadCampaignDetails();
      data.notify({ tone: 'success', message: 'Media added to campaign.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not add campaign item.' });
    } finally {
      setAddingCampaignMediaId(null);
    }
  }

  async function removeCampaignItem(item: CampaignItem) {
    if (!supabase) return;

    try {
      const { error } = await supabase.from('campaign_items').delete().eq('id', item.id);
      if (error) throw error;
      await loadCampaignDetails();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not remove campaign item.' });
    }
  }

  async function toggleScreenAssignment(screenId: string) {
    if (!supabase || !selectedCampaignId) return;

    try {
      if (assignedScreenIds.has(screenId)) {
        const { error } = await supabase
          .from('campaign_screens')
          .delete()
          .eq('campaign_id', selectedCampaignId)
          .eq('screen_id', screenId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('campaign_screens').insert({
          campaign_id: selectedCampaignId,
          screen_id: screenId,
        });
        if (error) throw error;
      }

      await loadCampaignDetails();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update screen assignment.' });
    }
  }

  async function publishCampaign() {
    if (!supabase || !selectedCampaign || orderedCampaignItems.length === 0 || campaignScreens.length === 0) return;

    const confirmed = window.confirm(
      `Publish ${selectedCampaign.name} to ${campaignScreens.length} screen(s)? This replaces the current playlist on those screens.`,
    );

    if (!confirmed) return;
    setIsPublishing(true);

    try {
      for (const assignment of campaignScreens) {
        if (!assignment.screen_id) continue;
        const deleteResponse = await supabase.from('playlist_items').delete().eq('screen_id', assignment.screen_id);
        if (deleteResponse.error) throw deleteResponse.error;

        const rows = orderedCampaignItems
          .filter((item) => item.media_id)
          .map((item) => ({
            screen_id: assignment.screen_id,
            media_id: item.media_id,
            display_order: item.display_order,
            duration_seconds: item.duration_seconds ?? settings.defaultItemDurationSeconds,
            duration: item.duration_seconds ?? settings.defaultItemDurationSeconds,
            start_time: item.start_time ?? '00:00',
            end_time: item.end_time ?? '23:59',
          }));

        if (rows.length > 0) {
          const insertResponse = await supabase.from('playlist_items').insert(rows);
          if (insertResponse.error) throw insertResponse.error;
        }
      }

      await data.loadPlaylistItems();
      data.notify({ tone: 'success', message: 'Campaign published to assigned screens.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not publish campaign.' });
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="New campaign" description="Group content by client, dates, and target screens." />
          <form onSubmit={createCampaign} className="mt-5 space-y-4">
            <Field label="Campaign name">
              <input value={name} onChange={(event) => setName(event.target.value)} className="field" placeholder="June lobby promo" required />
            </Field>
            <Field label="Customer">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="field" placeholder="Client name" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date">
                <input value={startDate} onChange={(event) => setStartDate(event.target.value)} className="field" type="date" />
              </Field>
              <Field label="End date">
                <input value={endDate} onChange={(event) => setEndDate(event.target.value)} className="field" type="date" />
              </Field>
            </div>
            <button disabled={isSaving} className="primary-button w-full" type="submit">
              <Plus className="h-4 w-4" />
              {isSaving ? 'Creating...' : 'Create campaign'}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="Campaigns" description="Select one to manage items and screens." />
          <div className="mt-5 space-y-2">
            {campaigns.length === 0 ? (
              <EmptyState icon={<CalendarDays />} title="No campaigns" description="Create a campaign to organize client content." />
            ) : (
              campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                    campaign.id === selectedCampaignId ? 'border-cyan-300 bg-cyan-300/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                  }`}
                  type="button"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-white">{campaign.name}</span>
                    <Badge text={getCampaignStatus(campaign)} tone={getCampaignStatus(campaign) === 'Active' ? 'cyan' : 'amber'} />
                  </div>
                  <p className="truncate text-xs text-slate-500">{campaign.customer_name ?? 'No customer'}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
        {!selectedCampaign ? (
          <EmptyState icon={<CalendarDays />} title="Select a campaign" description="Campaign details, content, and screen assignment will appear here." />
        ) : (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{selectedCampaign.customer_name ?? 'No customer'}</p>
                <h2 className="text-xl font-semibold text-white">{selectedCampaign.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedCampaign.start_date || 'No start'} to {selectedCampaign.end_date || 'No end'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => toggleCampaignActive(selectedCampaign)} className="secondary-button py-2" type="button">
                  {selectedCampaign.is_active ? 'Pause' : 'Activate'}
                </button>
                <button
                  onClick={publishCampaign}
                  disabled={isPublishing || orderedCampaignItems.length === 0 || campaignScreens.length === 0}
                  className="primary-button py-2"
                  type="button"
                >
                  {isPublishing ? 'Publishing...' : 'Publish to screens'}
                </button>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
              <div>
                <PanelTitle title="Campaign items" description="Add media and apps in the order they should play." />
                <div className="mt-4 space-y-3">
                  {orderedCampaignItems.length === 0 ? (
                    <EmptyState icon={<Library />} title="No campaign items" description="Add content from the library." />
                  ) : (
                    orderedCampaignItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3">
                        <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-slate-400">
                          {item.media?.media_type === 'url' ? (
                            <AppWindow className="h-5 w-5" />
                          ) : item.media?.media_type === 'video' ? (
                            <Film className="h-5 w-5" />
                          ) : (
                            <Image className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{item.media?.file_name ?? 'Missing media'}</p>
                          <p className="text-xs text-slate-500">Order {item.display_order} - {item.duration_seconds ?? settings.defaultItemDurationSeconds}s</p>
                        </div>
                        <button onClick={() => removeCampaignItem(item)} className="icon-button text-rose-200 hover:border-rose-300" type="button" title="Remove item">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <PanelTitle title="Assign screens" description="Choose where this campaign will publish." />
                  <div className="mt-4 space-y-2">
                    {data.screens.map((screen) => (
                      <label key={screen.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-200">
                        <input
                          checked={assignedScreenIds.has(screen.id)}
                          onChange={() => toggleScreenAssignment(screen.id)}
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-300"
                        />
                        <span className="min-w-0 flex-1 truncate">{screen.name ?? 'New-Player'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <PanelTitle title="Add content" description="Use existing media and app cards." />
                  <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                    {data.media.map((asset) => (
                      <button
                        key={asset.id}
                        onClick={() => addMediaToCampaign(asset)}
                        disabled={addingCampaignMediaId === asset.id}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-left transition hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                        type="button"
                      >
                        {asset.media_type === 'url' ? <AppWindow className="h-4 w-4 text-emerald-300" /> : asset.media_type === 'video' ? <Film className="h-4 w-4 text-amber-300" /> : <Image className="h-4 w-4 text-cyan-300" />}
                        <span className="min-w-0 flex-1 truncate text-sm text-white">{asset.file_name}</span>
                        {addingCampaignMediaId === asset.id ? <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> : <Plus className="h-4 w-4 text-slate-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function getCampaignStatus(campaign: Campaign): 'Paused' | 'Upcoming' | 'Active' | 'Expired' {
  if (!campaign.is_active) return 'Paused';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = campaign.start_date ? new Date(`${campaign.start_date}T00:00:00`) : null;
  const end = campaign.end_date ? new Date(`${campaign.end_date}T23:59:59`) : null;

  if (start && today < start) return 'Upcoming';
  if (end && today > end) return 'Expired';
  return 'Active';
}

function explainTemplateCreateError(error: unknown): string {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('screen_templates_layout_type_check') || normalized.includes('check constraint')) {
    return 'Free canvas is not enabled in Supabase yet. Rerun supabase-templates-migration.sql, then create the template again.';
  }

  if (
    normalized.includes('column') &&
    (normalized.includes('x') ||
      normalized.includes('width') ||
      normalized.includes('height') ||
      normalized.includes('z_index') ||
      normalized.includes('border_radius'))
  ) {
    return 'Canvas zone columns are missing. Rerun supabase-templates-migration.sql so x, y, width, height, z_index, and border_radius exist.';
  }

  if (normalized.includes('screen_templates') || normalized.includes('screen_template_zones')) {
    return `${message}. Run supabase-templates-migration.sql if the template tables are missing or outdated.`;
  }

  return message || 'Could not create template.';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };
    const parts = [
      maybeError.message,
      maybeError.details,
      maybeError.hint,
      maybeError.error_description,
      maybeError.code ? `Code: ${maybeError.code}` : null,
    ]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map((part) => part.trim());

    if (parts.length > 0) return parts.join(' ');
  }

  return String(error);
}

function PlaylistRow({
  item,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdate,
}: {
  item: PlaylistItem;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<PlaylistItem>) => void;
}) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="grid gap-4 lg:grid-cols-[96px_1fr]">
        <div className="aspect-video overflow-hidden rounded-lg bg-slate-900">
          {item.media?.media_type === 'url' ? (
            <AppContent url={item.media.file_url} title={item.media.file_name} mode="thumbnail" />
          ) : item.media?.media_type === 'video' ? (
            <video className="h-full w-full object-cover" src={item.media.file_url} muted preload="metadata" />
          ) : item.media ? (
            <img className="h-full w-full object-cover" src={item.media.file_url} alt={item.media.file_name} loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-500">Missing</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Order {item.display_order}</p>
              <h3 className="truncate font-medium text-white">{item.media?.file_name ?? 'Deleted media'}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={!canMoveUp} onClick={onMoveUp} className="icon-button" type="button" title="Move earlier">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button disabled={!canMoveDown} onClick={onMoveDown} className="icon-button" type="button" title="Move later">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={onRemove} className="icon-button text-rose-200 hover:border-rose-300" type="button" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Duration">
              <input
                className="field"
                min={1}
                type="number"
                value={item.duration_seconds ?? 10}
                onChange={(event) => onUpdate({ duration_seconds: Number(event.target.value) || 10 })}
              />
            </Field>
            <Field label="Start">
              <input className="field" type="time" value={item.start_time ?? '00:00'} onChange={(event) => onUpdate({ start_time: event.target.value })} />
            </Field>
            <Field label="End">
              <input className="field" type="time" value={item.end_time ?? '23:59'} onChange={(event) => onUpdate({ end_time: event.target.value })} />
            </Field>
          </div>
        </div>
      </div>
    </article>
  );
}

function PreviewPanel({
  data,
  activeItems,
}: {
  data: ReturnType<typeof useSignageData>;
  activeItems: PlaylistItem[];
}) {
  const screen = data.selectedScreen;
  const [activeTemplate, setActiveTemplate] = useState<{
    template: ScreenTemplate;
    zones: ScreenTemplateZone[];
  } | null>(null);
  const [templateError, setTemplateError] = useState('');
  const [assignedPlaylistItems, setAssignedPlaylistItems] = useState<PlaylistItem[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const previewItems = assignedPlaylistItems ?? activeItems;

  const playlistSignature = useMemo(
    () =>
      previewItems
        .map((item) => `${item.id}:${item.media_id}:${item.display_order}:${item.duration_seconds}:${item.media?.file_url}`)
        .join('|'),
    [previewItems],
  );
  const currentItem = previewItems[currentIndex % Math.max(previewItems.length, 1)] ?? null;

  const advance = useCallback(() => {
    setCurrentIndex((index) => (index + 1) % Math.max(previewItems.length, 1));
    setPlaybackCycle((cycle) => cycle + 1);
  }, [previewItems.length]);

  const loadAssignedPlaylist = useCallback(async () => {
    if (!supabase || !screen) {
      setAssignedPlaylistItems(null);
      return;
    }
    try {
      const assignment = await supabase
        .from('screen_playlist_assignments')
        .select('playlist_id')
        .eq('screen_id', screen.id)
        .maybeSingle();
      if (assignment.error || !assignment.data?.playlist_id) {
        setAssignedPlaylistItems(null);
        return;
      }
      const response = await supabase
        .from('playlist_items')
        .select('id, screen_id, playlist_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)')
        .eq('playlist_id', assignment.data.playlist_id)
        .order('display_order', { ascending: true });
      if (response.error) throw response.error;
      setAssignedPlaylistItems(
        ((response.data ?? []) as unknown as PlaylistItem[]).filter(
          (item) => item.media && isWithinWindow(item.start_time, item.end_time),
        ),
      );
    } catch {
      setAssignedPlaylistItems(null);
    }
  }, [screen]);

  const loadActiveTemplate = useCallback(async () => {
    if (!supabase || !screen) {
      setActiveTemplate(null);
      setTemplateError('');
      return;
    }

    try {
      const assignmentResponse = await supabase
        .from('screen_template_assignments')
        .select('template_id')
        .eq('screen_id', screen.id)
        .eq('active', true)
        .maybeSingle();

      if (assignmentResponse.error) throw assignmentResponse.error;
      if (!assignmentResponse.data?.template_id) {
        setActiveTemplate(null);
        setTemplateError('');
        return;
      }

      const [templateResponse, zonesResponse] = await Promise.all([
        supabase
          .from('screen_templates')
          .select('*')
          .eq('id', assignmentResponse.data.template_id)
          .maybeSingle(),
        supabase
          .from('screen_template_zones')
          .select(TEMPLATE_ZONE_SELECT)
          .eq('template_id', assignmentResponse.data.template_id)
          .order('sort_order', { ascending: true }),
      ]);

      if (templateResponse.error) throw templateResponse.error;
      if (zonesResponse.error) throw zonesResponse.error;
      if (!templateResponse.data) throw new Error('The assigned template no longer exists.');

      setActiveTemplate({
        template: templateResponse.data as ScreenTemplate,
        zones: (zonesResponse.data ?? []) as unknown as ScreenTemplateZone[],
      });
      setTemplateError('');
    } catch (error) {
      setActiveTemplate(null);
      setTemplateError(error instanceof Error ? error.message : 'Could not load the assigned template.');
    }
  }, [screen]);

  useEffect(() => {
    loadActiveTemplate();
  }, [loadActiveTemplate]);

  useEffect(() => {
    loadAssignedPlaylist();
  }, [loadAssignedPlaylist]);

  useEffect(() => {
    if (!supabase || !screen) return;
    const client = supabase;
    const channel = client
      .channel(`admin-preview-${screen.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_template_assignments', filter: `screen_id=eq.${screen.id}` }, loadActiveTemplate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_templates' }, loadActiveTemplate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_template_zones' }, loadActiveTemplate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_playlist_assignments', filter: `screen_id=eq.${screen.id}` }, loadAssignedPlaylist)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlists' }, loadAssignedPlaylist)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_items' }, loadAssignedPlaylist)
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadActiveTemplate, loadAssignedPlaylist, screen]);

  useEffect(() => {
    setCurrentIndex(0);
    setPlaybackCycle(0);
  }, [playlistSignature, screen?.id]);

  useEffect(() => {
    if (activeTemplate || !currentItem?.media) return;
    const app = currentItem.media.media_type === 'url' ? parseSignageApp(currentItem.media.file_url) : null;
    if (currentItem.media.media_type === 'video' || app?.kind === 'youtube') return;

    const timeoutId = window.setTimeout(
      advance,
      Math.max(1, currentItem.duration_seconds ?? currentItem.duration ?? 10) * 1000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [activeTemplate, advance, currentItem]);

  const signature = currentItem
    ? `${currentItem.id}-${currentItem.media?.created_at ?? ''}-${playbackCycle}`
    : '';

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
      <PanelTitle title="Current preview" description={screen ? `Active playback for ${screen.name ?? 'New-Player'}.` : 'Select a screen first.'} />
      <div className="mt-4 max-w-sm">
        <Field label="Screen">
          <select
            className="field"
            value={data.selectedScreenId ?? ''}
            onChange={(event) => data.setSelectedScreenId(event.target.value || null)}
          >
            {data.screens.length === 0 && <option value="">No screens available</option>}
            {data.screens.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name ?? 'New-Player'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {templateError && (
        <div className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Template preview failed: {templateError}
        </div>
      )}
      <div className="mt-5 overflow-hidden rounded-lg border border-slate-800 bg-black">
        <div className="aspect-video">
          {activeTemplate ? (
            <TemplateRenderer
              template={activeTemplate.template}
              zones={activeTemplate.zones}
              mode="player"
            />
          ) : !currentItem?.media ? (
            <div className="flex h-full items-center justify-center text-slate-500">No active media for this time window</div>
          ) : currentItem.media.media_type === 'url' ? (
            <AppContent
              key={signature}
              url={currentItem.media.file_url}
              title={currentItem.media.file_name}
              mode="player"
              loopPlayback={previewItems.length === 1}
              onPlaybackComplete={advance}
            />
          ) : currentItem.media.media_type === 'video' ? (
            <video
              key={signature}
              className="h-full w-full object-contain"
              src={appendCacheSignature(currentItem.media.file_url, signature)}
              autoPlay
              loop={previewItems.length === 1}
              muted
              playsInline
              preload="auto"
              onEnded={advance}
              onError={advance}
            />
          ) : (
            <img
              key={signature}
              className="h-full w-full object-contain"
              src={appendCacheSignature(currentItem.media.file_url, signature)}
              alt={currentItem.media.file_name}
              onError={advance}
            />
          )}
        </div>
      </div>
      {activeTemplate && (
        <div className="mt-4 rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          Template active: {activeTemplate.template.name}
        </div>
      )}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {previewItems.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border px-3 py-2 ${!activeTemplate && item.id === currentItem?.id ? 'border-cyan-300/60 bg-cyan-500/10' : 'border-slate-800 bg-slate-950'}`}
          >
            <p className="truncate text-sm font-medium text-white">{item.media?.file_name ?? 'Missing media'}</p>
            <p className="text-xs text-slate-500">
              {item.start_time ?? '00:00'} to {item.end_time ?? '23:59'} - {item.duration_seconds ?? 10}s
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplatesPanel({ data }: { data: ReturnType<typeof useSignageData> }) {
  const [templates, setTemplates] = useState<ScreenTemplate[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [zones, setZones] = useState<ScreenTemplateZone[]>([]);
  const [assignments, setAssignments] = useState<ScreenTemplateAssignment[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [canvasEditorTemplateId, setCanvasEditorTemplateId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [layoutType, setLayoutType] = useState<TemplateLayoutType>('split');
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const assignedScreenIds = new Set(assignments.filter((assignment) => assignment.active).map((assignment) => assignment.screen_id).filter(Boolean));

  const loadTemplates = useCallback(async () => {
    if (!supabase) return;

    try {
      const { data: rows, error } = await supabase
        .from('screen_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const nextTemplates = (rows ?? []) as ScreenTemplate[];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) =>
        current && nextTemplates.some((template) => template.id === current)
          ? current
          : nextTemplates[0]?.id ?? null,
      );
    } catch (error) {
      data.notify({
        tone: 'error',
        message:
          error instanceof Error
            ? `${error.message}. Run supabase-templates-migration.sql to enable templates.`
            : 'Could not load templates.',
      });
    }
  }, [data]);

  const loadReusablePlaylists = useCallback(async () => {
    if (!supabase) return;
    const { data: rows, error } = await supabase.from('playlists').select('*').order('name');
    if (error) {
      data.notify({ tone: 'error', message: `${error.message}. Run supabase-playlists-migration.sql.` });
      return;
    }
    setPlaylists((rows ?? []) as Playlist[]);
  }, [data]);

  const loadTemplateDetails = useCallback(
    async (templateId = selectedTemplateId) => {
      if (!supabase || !templateId) {
        setZones([]);
        setAssignments([]);
        return;
      }

      try {
        const [zonesResponse, assignmentsResponse] = await Promise.all([
          supabase
            .from('screen_template_zones')
            .select(TEMPLATE_ZONE_SELECT)
            .eq('template_id', templateId)
            .order('sort_order', { ascending: true }),
          supabase.from('screen_template_assignments').select('*').eq('template_id', templateId),
        ]);

        if (zonesResponse.error) throw zonesResponse.error;
        if (assignmentsResponse.error) throw assignmentsResponse.error;
        setZones((zonesResponse.data ?? []) as unknown as ScreenTemplateZone[]);
        setAssignments((assignmentsResponse.data ?? []) as ScreenTemplateAssignment[]);
      } catch (error) {
        data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not load template details.' });
      }
    },
    [data, selectedTemplateId],
  );

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadReusablePlaylists();
  }, [loadReusablePlaylists]);

  useEffect(() => {
    loadTemplateDetails();
  }, [loadTemplateDetails]);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setIsCreating(true);

    let createdTemplateId: string | null = null;

    try {
      const { data: inserted, error } = await supabase
        .from('screen_templates')
        .insert({
          name: name.trim(),
          layout_type: layoutType,
        })
        .select('*')
        .single();

      if (error) throw error;
      const template = inserted as ScreenTemplate;
      createdTemplateId = template.id;
      const zoneRows = buildStarterTemplateZoneRows(layoutType, template.id, data.media);

      const zoneResponse = await supabase.from('screen_template_zones').insert(zoneRows);
      if (zoneResponse.error) throw zoneResponse.error;

      setName('');
      setSelectedTemplateId(template.id);
      setIsCreateTemplateOpen(false);
      await loadTemplates();
      await loadTemplateDetails(template.id);
      data.notify({ tone: 'success', message: 'Template created.' });
    } catch (error) {
      if (createdTemplateId) {
        await supabase.from('screen_templates').delete().eq('id', createdTemplateId);
      }
      data.notify({ tone: 'error', message: explainTemplateCreateError(error) });
    } finally {
      setIsCreating(false);
    }
  }

  async function updateZone(zone: ScreenTemplateZone, patch: Partial<ScreenTemplateZone>) {
    if (!supabase) return;

    try {
      const { error } = await supabase.from('screen_template_zones').update(patch).eq('id', zone.id);
      if (error) throw error;
      await loadTemplateDetails();
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not update zone.' });
    }
  }

  async function addCanvasZone() {
    if (!supabase || !selectedTemplate) return;

    const nextNumber = zones.length + 1;
    const nextOffset = Math.min(40, (nextNumber - 1) * 5);

    try {
      const { error } = await supabase.from('screen_template_zones').insert({
        template_id: selectedTemplate.id,
        zone_key: `zone_${nextNumber}`,
        sort_order: nextNumber,
        fit_mode: 'contain',
        background_color: '#020617',
        x: 5 + nextOffset,
        y: 5 + nextOffset,
        width: 35,
        height: 35,
        z_index: nextNumber,
        border_radius: 8,
      });

      if (error) throw error;
      await loadTemplateDetails();
      data.notify({ tone: 'success', message: 'Canvas zone added.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not add canvas zone.' });
    }
  }

  async function removeCanvasZone(zone: ScreenTemplateZone) {
    if (!supabase) return;

    try {
      const { error } = await supabase.from('screen_template_zones').delete().eq('id', zone.id);
      if (error) throw error;
      await loadTemplateDetails();
      data.notify({ tone: 'success', message: 'Canvas zone removed.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not remove canvas zone.' });
    }
  }

  async function toggleScreenAssignment(screenId: string) {
    if (!supabase || !selectedTemplateId) return;

    try {
      if (assignedScreenIds.has(screenId)) {
        const { error } = await supabase
          .from('screen_template_assignments')
          .update({ active: false })
          .eq('screen_id', screenId)
          .eq('template_id', selectedTemplateId);
        if (error) throw error;
      } else {
        const deactivateResponse = await supabase
          .from('screen_template_assignments')
          .update({ active: false })
          .eq('screen_id', screenId);
        if (deactivateResponse.error) throw deactivateResponse.error;

        const assignResponse = await supabase
          .from('screen_template_assignments')
          .upsert(
            {
              screen_id: screenId,
              template_id: selectedTemplateId,
              active: true,
            },
            { onConflict: 'screen_id,template_id' },
          );
        if (assignResponse.error) throw assignResponse.error;
      }

      await loadTemplateDetails();
      if (!assignedScreenIds.has(screenId)) {
        data.setSelectedScreenId(screenId);
        await data.loadPlaylistItems(screenId);
      }
      data.notify({ tone: 'success', message: 'Template assignment updated.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not assign template.' });
    }
  }

  async function deleteTemplate() {
    if (!supabase || !selectedTemplate) return;

    const confirmed = window.confirm(`Delete template ${selectedTemplate.name}? This removes its screen assignments.`);
    if (!confirmed) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.from('screen_templates').delete().eq('id', selectedTemplate.id);
      if (error) throw error;
      setSelectedTemplateId(null);
      setZones([]);
      setAssignments([]);
      await loadTemplates();
      data.notify({ tone: 'success', message: 'Template deleted.' });
    } catch (error) {
      data.notify({ tone: 'error', message: error instanceof Error ? error.message : 'Could not delete template.' });
    } finally {
      setIsDeleting(false);
    }
  }

  if (canvasEditorTemplateId && selectedTemplate?.layout_type === 'canvas') {
    return (
      <CanvasTemplateEditor
        template={selectedTemplate}
        zones={zones}
        media={data.media}
        playlists={playlists}
        onBack={() => setCanvasEditorTemplateId(null)}
        onAddZone={addCanvasZone}
        onRemoveZone={removeCanvasZone}
        onUpdateZone={updateZone}
      />
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="Create" description="Start from a visual template gallery, then customize the zones." />
          <button onClick={() => setIsCreateTemplateOpen(true)} className="primary-button mt-5 w-full" type="button">
            <Plus className="h-4 w-4" />
            Create template
          </button>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
          <PanelTitle title="Saved templates" description="Select a template to edit or assign." />
          <div className="mt-5 space-y-2">
            {templates.length === 0 ? (
              <EmptyState icon={<SplitSquareHorizontal />} title="No templates" description="Create a template to customize a screen layout." />
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                    template.id === selectedTemplateId ? 'border-cyan-300 bg-cyan-300/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'
                  }`}
                  type="button"
                >
                  <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{getTemplateLayout(template.layout_type).label}</p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {isCreateTemplateOpen && (
        <ModalShell title="Create template" onClose={() => setIsCreateTemplateOpen(false)}>
          <form onSubmit={createTemplate} className="space-y-5">
            <Field label="Template name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="field"
                placeholder="YouTube + poster"
                required
              />
            </Field>
            <div>
              <p className="mb-3 text-sm font-medium text-slate-300">Choose a template style</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATE_LAYOUTS.map((layout) => (
                  <TemplateGalleryCard
                    key={layout.type}
                    layoutType={layout.type}
                    active={layoutType === layout.type}
                    onSelect={() => setLayoutType(layout.type)}
                  />
                ))}
              </div>
            </div>
            <button disabled={isCreating} className="primary-button w-full" type="submit">
              <Plus className="h-4 w-4" />
              {isCreating ? 'Creating...' : `Create ${getTemplateLayout(layoutType).label}`}
            </button>
          </form>
        </ModalShell>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
        {!selectedTemplate ? (
          <EmptyState icon={<SplitSquareHorizontal />} title="Select a template" description="Template zones, preview, and screen assignment will appear here." />
        ) : (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{getTemplateLayout(selectedTemplate.layout_type).label}</p>
                <h2 className="text-xl font-semibold text-white">{selectedTemplate.name}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.layout_type === 'canvas' && (
                  <button
                    onClick={() => setCanvasEditorTemplateId(selectedTemplate.id)}
                    className="primary-button py-2"
                    type="button"
                  >
                    <SplitSquareHorizontal className="h-4 w-4" />
                    Open canvas editor
                  </button>
                )}
                <button
                  onClick={deleteTemplate}
                  disabled={isDeleting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
              <div className="space-y-5">
                <div className="overflow-hidden rounded-lg border border-slate-800 bg-black">
                  <div className="aspect-video">
                    <TemplateRenderer
                      template={selectedTemplate}
                      zones={zones}
                      mode="preview"
                      editable={selectedTemplate.layout_type === 'canvas'}
                      onCanvasZoneChange={(zone, patch) => updateZone(zone, patch)}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <PanelTitle title="Zones" description="Choose what each part of the screen should show." />
                    {selectedTemplate.layout_type === 'canvas' && (
                      <button onClick={() => setCanvasEditorTemplateId(selectedTemplate.id)} className="primary-button py-2" type="button">
                        <SplitSquareHorizontal className="h-4 w-4" />
                        Open canvas editor
                      </button>
                    )}
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedTemplate.layout_type === 'canvas'
                      ? (
                          <div className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-center">
                            <SplitSquareHorizontal className="mx-auto mb-3 h-8 w-8 text-cyan-300" />
                            <p className="font-medium text-white">{zones.length} canvas zones</p>
                            <p className="mt-1 text-sm text-slate-500">Use the full canvas editor to move, resize, add, and remove zones.</p>
                          </div>
                        )
                      : getTemplateLayout(selectedTemplate.layout_type).zones.map((definition) => {
                          const zone = zones.find((candidate) => candidate.zone_key === definition.key);
                          if (!zone) return null;

                          return (
                            <PresetZoneEditor
                              key={definition.key}
                              label={definition.label}
                              zone={zone}
                              media={data.media}
                              playlists={playlists}
                              onUpdate={(patch) => updateZone(zone, patch)}
                            />
                          );
                        })}
                  </div>
                </div>
              </div>

              <div>
                <PanelTitle title="Assign to screens" description="An active template overrides the normal playlist." />
                <div className="mt-4 space-y-2">
                  {data.screens.length === 0 ? (
                    <EmptyState icon={<Monitor />} title="No screens" description="Create a screen before assigning templates." />
                  ) : (
                    data.screens.map((screen) => (
                      <label key={screen.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-sm text-slate-200">
                        <input
                          checked={assignedScreenIds.has(screen.id)}
                          onChange={() => toggleScreenAssignment(screen.id)}
                          type="checkbox"
                          className="h-4 w-4 accent-cyan-300"
                        />
                        <span className="min-w-0 flex-1 truncate">{screen.name ?? 'New-Player'}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CanvasTemplateEditor({
  template,
  zones,
  media,
  playlists,
  onBack,
  onAddZone,
  onRemoveZone,
  onUpdateZone,
}: {
  template: ScreenTemplate;
  zones: ScreenTemplateZone[];
  media: Media[];
  playlists: Playlist[];
  onBack: () => void;
  onAddZone: () => void;
  onRemoveZone: (zone: ScreenTemplateZone) => void;
  onUpdateZone: (zone: ScreenTemplateZone, patch: Partial<ScreenTemplateZone>) => void;
}) {
  const [draftZones, setDraftZones] = useState<ScreenTemplateZone[]>(zones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const selectedZone = draftZones.find((zone) => zone.id === selectedZoneId) ?? draftZones[0] ?? null;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    zone: ScreenTemplateZone;
    action: 'move' | 'resize';
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    latestPatch: Partial<ScreenTemplateZone>;
  } | null>(null);

  useEffect(() => {
    setDraftZones(zones);
    setSelectedZoneId((current) => current ?? zones[0]?.id ?? null);
  }, [zones]);

  function patchDraft(zoneId: string, patch: Partial<ScreenTemplateZone>) {
    setDraftZones((current) => current.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)));
  }

  function startCanvasInteraction(event: ReactPointerEvent<HTMLElement>, zone: ScreenTemplateZone, action: 'move' | 'resize') {
    event.preventDefault();
    event.stopPropagation();
    setSelectedZoneId(zone.id);

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      zone,
      action,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(zone.x ?? 0),
      startY: Number(zone.y ?? 0),
      startWidth: Number(zone.width ?? 50),
      startHeight: Number(zone.height ?? 50),
      latestPatch: {},
    };
  }

  function moveCanvasInteraction(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || !rect || event.pointerId !== drag.pointerId) return;

    event.preventDefault();
    const deltaX = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const deltaY = ((event.clientY - drag.startClientY) / rect.height) * 100;

    drag.latestPatch =
      drag.action === 'move'
        ? {
            x: clamp(drag.startX + deltaX, 0, 100 - drag.startWidth),
            y: clamp(drag.startY + deltaY, 0, 100 - drag.startHeight),
          }
        : {
            width: clamp(drag.startWidth + deltaX, 5, 100 - drag.startX),
            height: clamp(drag.startHeight + deltaY, 5, 100 - drag.startY),
          };

    patchDraft(drag.zone.id, drag.latestPatch);
  }

  function endCanvasInteraction(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (Object.keys(drag.latestPatch).length > 0) {
      onUpdateZone(drag.zone, drag.latestPatch);
    }

    dragRef.current = null;
  }

  function updateSelectedZone(patch: Partial<ScreenTemplateZone>) {
    if (!selectedZone) return;
    patchDraft(selectedZone.id, patch);
    onUpdateZone(selectedZone, patch);
  }

  function updateSelectedZoneDraft(patch: Partial<ScreenTemplateZone>) {
    if (!selectedZone) return;
    patchDraft(selectedZone.id, patch);
  }

  function saveSelectedZoneDraft(patch: Partial<ScreenTemplateZone>) {
    if (!selectedZone) return;
    onUpdateZone({ ...selectedZone, ...patch }, patch);
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-cyan-200">Canvas editor</p>
          <h2 className="text-xl font-semibold text-white">{template.name}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onAddZone} className="primary-button py-2" type="button">
            <Plus className="h-4 w-4" />
            Add zone
          </button>
          <button onClick={onBack} className="secondary-button py-2" type="button">
            <ArrowLeft className="h-4 w-4" />
            Done
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="rounded-lg border border-slate-800 bg-black p-3">
          <div ref={canvasRef} className="relative aspect-video overflow-hidden rounded-lg bg-black" data-large-canvas="true">
            {draftZones.map((zone) => (
              <div
                key={zone.id}
                className={`absolute overflow-hidden border ${selectedZoneId === zone.id ? 'border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.65)]' : 'border-white/20'}`}
                style={{
                  left: `${zone.x ?? 0}%`,
                  top: `${zone.y ?? 0}%`,
                  width: `${zone.width ?? 50}%`,
                  height: `${zone.height ?? 50}%`,
                  zIndex: zone.z_index ?? 1,
                  borderRadius: `${zone.border_radius ?? 0}px`,
                  backgroundColor: zone.background_color ?? '#020617',
                }}
              >
                {zone.media || zone.playlist ? (
                  <TemplateRenderer template={{ ...template, layout_type: 'full' }} zones={[{ ...zone, zone_key: 'main' }]} mode="preview" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-500">{zone.zone_key}</div>
                )}
                <button
                  onPointerDown={(event) => startCanvasInteraction(event, zone, 'move')}
                  onPointerMove={moveCanvasInteraction}
                  onPointerUp={endCanvasInteraction}
                  onPointerCancel={endCanvasInteraction}
                  onClick={() => setSelectedZoneId(zone.id)}
                  className="absolute inset-0 z-10 cursor-move bg-cyan-300/0"
                  style={{ touchAction: 'none' }}
                  type="button"
                  title="Move zone"
                >
                  <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white">{zone.zone_key}</span>
                </button>
                <button
                  onPointerDown={(event) => startCanvasInteraction(event, zone, 'resize')}
                  onPointerMove={moveCanvasInteraction}
                  onPointerUp={endCanvasInteraction}
                  onPointerCancel={endCanvasInteraction}
                  className="absolute bottom-1 right-1 z-20 h-6 w-6 cursor-se-resize rounded border border-white/80 bg-cyan-300"
                  style={{ touchAction: 'none' }}
                  type="button"
                  title="Resize zone"
                />
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          {!selectedZone ? (
            <EmptyState icon={<SplitSquareHorizontal />} title="No zones" description="Add a zone to begin customizing this canvas." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Selected</p>
                  <h3 className="font-semibold text-white">{selectedZone.zone_key}</h3>
                </div>
                <button onClick={() => onRemoveZone(selectedZone)} className="icon-button text-rose-200 hover:border-rose-300" type="button" title="Remove zone">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <ZoneContentSelect zone={selectedZone} media={media} playlists={playlists} onUpdate={updateSelectedZone} />
              <ZoneFitSelect zone={selectedZone} onUpdate={updateSelectedZone} />
              <ZoneColorInput zone={selectedZone} onUpdate={updateSelectedZone} />

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="X %"
                  value={selectedZone.x ?? 0}
                  min={0}
                  max={95}
                  onDraft={(value) => updateSelectedZoneDraft({ x: value })}
                  onCommit={(value) => saveSelectedZoneDraft({ x: value })}
                />
                <NumberField
                  label="Y %"
                  value={selectedZone.y ?? 0}
                  min={0}
                  max={95}
                  onDraft={(value) => updateSelectedZoneDraft({ y: value })}
                  onCommit={(value) => saveSelectedZoneDraft({ y: value })}
                />
                <NumberField
                  label="W %"
                  value={selectedZone.width ?? 50}
                  min={5}
                  max={100}
                  onDraft={(value) => updateSelectedZoneDraft({ width: value })}
                  onCommit={(value) => saveSelectedZoneDraft({ width: value })}
                />
                <NumberField
                  label="H %"
                  value={selectedZone.height ?? 50}
                  min={5}
                  max={100}
                  onDraft={(value) => updateSelectedZoneDraft({ height: value })}
                  onCommit={(value) => saveSelectedZoneDraft({ height: value })}
                />
                <NumberField
                  label="Layer"
                  value={selectedZone.z_index ?? 1}
                  min={0}
                  max={100}
                  step={1}
                  onDraft={(value) => updateSelectedZoneDraft({ z_index: Math.round(value) })}
                  onCommit={(value) => saveSelectedZoneDraft({ z_index: Math.round(value) })}
                />
                <NumberField
                  label="Radius"
                  value={selectedZone.border_radius ?? 0}
                  min={0}
                  max={80}
                  onDraft={(value) => updateSelectedZoneDraft({ border_radius: value })}
                  onCommit={(value) => saveSelectedZoneDraft({ border_radius: value })}
                />
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function TemplateGalleryCard({
  layoutType,
  active,
  onSelect,
}: {
  layoutType: TemplateLayoutType;
  active: boolean;
  onSelect: () => void;
}) {
  const layout = getTemplateLayout(layoutType);
  const previewTemplate: ScreenTemplate = {
    id: `preview-${layoutType}`,
    name: layout.label,
    layout_type: layoutType,
    created_at: null,
  };

  return (
    <article
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      className={`cursor-pointer overflow-hidden rounded-lg border bg-slate-950 transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${
        active ? 'border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.45)]' : 'border-slate-800 hover:border-slate-600'
      }`}
    >
      <div className="pointer-events-none aspect-video bg-black">
        <TemplateRenderer template={previewTemplate} zones={getTemplatePreviewZones(layoutType)} mode="preview" />
      </div>
      <div className="p-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-white">{layout.label}</p>
          {active && <Badge text="Selected" />}
        </div>
        <p className="text-xs leading-5 text-slate-500">{layout.description}</p>
      </div>
    </article>
  );
}

function PresetZoneEditor({
  label,
  zone,
  media,
  playlists,
  onUpdate,
}: {
  label: string;
  zone: ScreenTemplateZone;
  media: Media[];
  playlists: Playlist[];
  onUpdate: (patch: Partial<ScreenTemplateZone>) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <Badge text={zone.playlist?.name ?? zone.media?.file_name ?? 'Empty'} tone={zone.playlist || zone.media ? 'cyan' : 'amber'} />
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_120px_72px]">
        <ZoneContentSelect zone={zone} media={media} playlists={playlists} onUpdate={onUpdate} />
        <ZoneFitSelect zone={zone} onUpdate={onUpdate} />
        <ZoneColorInput zone={zone} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function CanvasZoneEditor({
  zone,
  media,
  onUpdate,
  onRemove,
}: {
  zone: ScreenTemplateZone;
  media: Media[];
  onUpdate: (patch: Partial<ScreenTemplateZone>) => void;
  onRemove: () => void;
}) {
  function updateNumber(key: keyof Pick<ScreenTemplateZone, 'x' | 'y' | 'width' | 'height' | 'z_index' | 'border_radius'>, value: string) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return;

    if (key === 'width' || key === 'height') {
      onUpdate({ [key]: clamp(numberValue, 5, 100) } as Partial<ScreenTemplateZone>);
      return;
    }

    if (key === 'x' || key === 'y') {
      onUpdate({ [key]: clamp(numberValue, 0, 95) } as Partial<ScreenTemplateZone>);
      return;
    }

    if (key === 'border_radius') {
      onUpdate({ [key]: clamp(numberValue, 0, 80) } as Partial<ScreenTemplateZone>);
      return;
    }

    onUpdate({ [key]: Math.max(0, Math.round(numberValue)) } as Partial<ScreenTemplateZone>);
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{zone.zone_key}</p>
        <button onClick={onRemove} className="icon-button text-rose-200 hover:border-rose-300" type="button" title="Remove zone">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_120px_72px]">
        <ZoneContentSelect zone={zone} media={media} onUpdate={onUpdate} />
        <ZoneFitSelect zone={zone} onUpdate={onUpdate} />
        <ZoneColorInput zone={zone} onUpdate={onUpdate} />
      </div>

      <details className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-200">Advanced position</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <NumberField
            label="X %"
            value={zone.x ?? 0}
            min={0}
            max={95}
            onDraft={(value) => updateNumber('x', String(value))}
            onCommit={(value) => updateNumber('x', String(value))}
          />
          <NumberField
            label="Y %"
            value={zone.y ?? 0}
            min={0}
            max={95}
            onDraft={(value) => updateNumber('y', String(value))}
            onCommit={(value) => updateNumber('y', String(value))}
          />
          <NumberField
            label="W %"
            value={zone.width ?? 50}
            min={5}
            max={100}
            onDraft={(value) => updateNumber('width', String(value))}
            onCommit={(value) => updateNumber('width', String(value))}
          />
          <NumberField
            label="H %"
            value={zone.height ?? 50}
            min={5}
            max={100}
            onDraft={(value) => updateNumber('height', String(value))}
            onCommit={(value) => updateNumber('height', String(value))}
          />
          <NumberField
            label="Layer"
            value={zone.z_index ?? 1}
            min={0}
            max={100}
            step={1}
            onDraft={(value) => updateNumber('z_index', String(value))}
            onCommit={(value) => updateNumber('z_index', String(value))}
          />
          <NumberField
            label="Radius"
            value={zone.border_radius ?? 0}
            min={0}
            max={80}
            onDraft={(value) => updateNumber('border_radius', String(value))}
            onCommit={(value) => updateNumber('border_radius', String(value))}
          />
        </div>
      </details>
    </div>
  );
}

function ZoneContentSelect({
  zone,
  media,
  playlists = [],
  onUpdate,
}: {
  zone: ScreenTemplateZone;
  media: Media[];
  playlists?: Playlist[];
  onUpdate: (patch: Partial<ScreenTemplateZone>) => void;
}) {
  return (
    <Field label="Content">
      <select
        value={zone.playlist_id ? `playlist:${zone.playlist_id}` : zone.media_id ? `media:${zone.media_id}` : ''}
        onChange={(event) => {
          const [kind, id] = event.target.value.split(':');
          onUpdate({
            media_id: kind === 'media' ? id : null,
            playlist_id: kind === 'playlist' ? id : null,
          });
        }}
        className="field"
      >
        <option value="">None</option>
        {playlists.length > 0 && (
          <optgroup label="Playlists">
            {playlists.map((playlist) => (
              <option key={playlist.id} value={`playlist:${playlist.id}`}>
                {playlist.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Media">
        {media.map((asset) => (
          <option key={asset.id} value={`media:${asset.id}`}>
            {asset.file_name}
          </option>
        ))}
        </optgroup>
      </select>
    </Field>
  );
}

function ZoneFitSelect({
  zone,
  onUpdate,
}: {
  zone: ScreenTemplateZone;
  onUpdate: (patch: Partial<ScreenTemplateZone>) => void;
}) {
  return (
    <Field label="Fit">
      <select
        value={zone.fit_mode ?? 'contain'}
        onChange={(event) => onUpdate({ fit_mode: event.target.value as 'contain' | 'cover' })}
        className="field"
      >
        <option value="contain">Contain</option>
        <option value="cover">Cover</option>
      </select>
    </Field>
  );
}

function ZoneColorInput({
  zone,
  onUpdate,
}: {
  zone: ScreenTemplateZone;
  onUpdate: (patch: Partial<ScreenTemplateZone>) => void;
}) {
  return (
    <Field label="Color">
      <input
        value={zone.background_color ?? '#020617'}
        onChange={(event) => onUpdate({ background_color: event.target.value })}
        className="h-[42px] w-full rounded-lg border border-slate-700 bg-slate-950 p-1"
        type="color"
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onDraft,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onDraft: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const [textValue, setTextValue] = useState(String(value));

  useEffect(() => {
    setTextValue(String(value));
  }, [value]);

  function normalize(nextValue: string) {
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return value;
    return clamp(parsed, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY);
  }

  function commit(nextValue = textValue) {
    const normalized = normalize(nextValue);
    setTextValue(String(normalized));
    onDraft(normalized);
    onCommit(normalized);
  }

  return (
    <Field label={label}>
      <input
        value={textValue}
        onChange={(event) => {
          setTextValue(event.target.value);
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) {
            onDraft(clamp(parsed, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY));
          }
        }}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className="field px-2"
        min={min}
        max={max}
        step={step}
        type="number"
      />
    </Field>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function SettingsPanel({
  data,
  settingsState,
}: {
  data: ReturnType<typeof useSignageData>;
  settingsState: ReturnType<typeof useAppSettings>;
}) {
  const [draft, setDraft] = useState<AppSettings>(settingsState.settings);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(settingsState.settings);
  }, [settingsState.settings]);

  function updateDraft(patch: Partial<AppSettings>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      await settingsState.updateSettings(draft);
      data.notify({ tone: 'success', message: 'Settings saved.' });
    } catch (error) {
      data.notify({
        tone: 'error',
        message:
          error instanceof Error
            ? `${error.message}. Run supabase-settings-migration.sql if the settings table does not exist yet.`
            : 'Could not save settings.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/80 p-5 shadow-panel">
      <PanelTitle title="Settings" description="Customize the brand, player fallback screen, footer, and playback defaults." />
      <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
        Settings use safe defaults. To save shared settings, run <span className="font-mono">supabase-settings-migration.sql</span> in Supabase.
      </div>

      <form onSubmit={saveSettings} className="mt-5 grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Brand name">
              <input value={draft.brandName} onChange={(event) => updateDraft({ brandName: event.target.value })} className="field" />
            </Field>
            <Field label="Brand subtitle">
              <input value={draft.brandSubtitle} onChange={(event) => updateDraft({ brandSubtitle: event.target.value })} className="field" />
            </Field>
          </div>

          <Field label="Player footer text">
            <input value={draft.playerFooterText} onChange={(event) => updateDraft({ playerFooterText: event.target.value })} className="field" />
          </Field>

          <Field label="Developer credit">
            <input value={draft.developerCredit} onChange={(event) => updateDraft({ developerCredit: event.target.value })} className="field" />
          </Field>

          <Field label="Player background image URL">
            <input value={draft.playerBackgroundUrl} onChange={(event) => updateDraft({ playerBackgroundUrl: event.target.value })} className="field" placeholder="/nehas-bg.jpg" />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Default duration">
              <input
                value={draft.defaultItemDurationSeconds}
                onChange={(event) => updateDraft({ defaultItemDurationSeconds: Math.max(1, Number(event.target.value) || 1) })}
                className="field"
                min={1}
                type="number"
              />
            </Field>
            <Field label="Image fit">
              <select value={draft.playerFitMode} onChange={(event) => updateDraft({ playerFitMode: event.target.value === 'cover' ? 'cover' : 'contain' })} className="field">
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
              </select>
            </Field>
            <label className="flex items-end">
              <span className="flex h-[42px] w-full items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200">
                <input
                  checked={draft.showPlayerFooter}
                  onChange={(event) => updateDraft({ showPlayerFooter: event.target.checked })}
                  type="checkbox"
                  className="h-4 w-4 accent-cyan-300"
                />
                Show footer
              </span>
            </label>
          </div>

          <button disabled={isSaving} className="primary-button" type="submit">
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-black">
          <div
            className="relative flex aspect-video flex-col items-center justify-center bg-slate-950 bg-cover bg-center px-5 text-center"
            style={{ backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.28), rgba(2, 6, 23, 0.76)), url("${draft.playerBackgroundUrl}")` }}
          >
            <MonitorPlay className="mb-3 h-10 w-10 text-cyan-100" />
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">{draft.brandName}</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">{draft.brandSubtitle}</h3>
            {draft.showPlayerFooter && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-3 py-2 text-[11px] text-white/80">
                <p>{draft.playerFooterText}</p>
                <p>{draft.developerCredit}</p>
              </div>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

function ScreenSelect({ data }: { data: ReturnType<typeof useSignageData> }) {
  return (
    <label className="mt-5 block">
      <span className="mb-2 block text-sm font-medium text-slate-300">Screen</span>
      <select
        className="field"
        value={data.selectedScreenId ?? ''}
        onChange={(event) => data.setSelectedScreenId(event.target.value || null)}
      >
        {data.screens.map((screen) => (
          <option key={screen.id} value={screen.id}>
            {screen.name ?? 'New-Player'} - {screen.location ?? 'No location'}
          </option>
        ))}
      </select>
    </label>
  );
}

function PanelTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ icon, title, description }: { icon: JSX.Element; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/70 px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-800 text-slate-300 [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <p className="font-medium text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function Status({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
        online ? 'bg-emerald-400/12 text-emerald-200' : 'bg-slate-700 text-slate-300'
      }`}
    >
      {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function Badge({ text, tone = 'cyan' }: { text: string; tone?: 'cyan' | 'amber' }) {
  return (
    <span className={tone === 'amber' ? 'rounded-lg bg-amber-400/12 px-2 py-1 text-xs font-medium text-amber-200' : 'rounded-lg bg-cyan-400/12 px-2 py-1 text-xs font-medium text-cyan-200'}>
      {text}
    </span>
  );
}
