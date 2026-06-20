import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Media, PlaylistItem, Screen, Toast } from '../types';

export function useSignageData() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [playlistItems, setPlaylistItems] = useState<PlaylistItem[]>([]);
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const selectedScreen = screens.find((screen) => screen.id === selectedScreenId) ?? null;

  const notify = useCallback((nextToast: Toast) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast(nextToast);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const loadScreens = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('screens')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    const nextScreens = (data ?? []) as Screen[];
    setScreens(nextScreens);
    setSelectedScreenId((current) =>
      current && nextScreens.some((screen) => screen.id === current)
        ? current
        : nextScreens[0]?.id ?? null,
    );
  }, []);

  const loadMedia = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setMedia((data ?? []) as Media[]);
  }, []);

  const loadPlaylistItems = useCallback(
    async (screenId = selectedScreenId) => {
      if (!supabase || !screenId) {
        setPlaylistItems([]);
        return;
      }

      const { data, error } = await supabase
        .from('playlist_items')
        .select(
          'id, screen_id, media_id, display_order, duration_seconds, duration, start_time, end_time, media(id, file_name, file_url, media_type, created_at)',
        )
        .eq('screen_id', screenId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setPlaylistItems((data ?? []) as unknown as PlaylistItem[]);
    },
    [selectedScreenId],
  );

  const refreshAll = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      await Promise.all([loadScreens(), loadMedia()]);
    } catch (error) {
      notify({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Could not load signage data.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadMedia, loadScreens, notify]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    loadPlaylistItems();
  }, [loadPlaylistItems]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadScreens().catch(() => undefined);
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadScreens]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    const channel = client
      .channel('signage-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screens' }, () => {
        loadScreens().catch(() => undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, () => {
        loadMedia().catch(() => undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_items' }, () => {
        loadPlaylistItems().catch(() => undefined);
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [loadMedia, loadPlaylistItems, loadScreens]);

  return {
    screens,
    media,
    playlistItems,
    selectedScreen,
    selectedScreenId,
    setSelectedScreenId,
    isLoading,
    toast,
    notify,
    refreshAll,
    loadScreens,
    loadMedia,
    loadPlaylistItems,
  };
}
