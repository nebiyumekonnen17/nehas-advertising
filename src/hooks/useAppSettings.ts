import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../lib/settings';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const refreshSettings = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const nextSettings = await loadAppSettings();
      setSettings(nextSettings);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const updateSettings = useCallback(async (nextSettings: AppSettings) => {
    await saveAppSettings(nextSettings);
    setSettings(nextSettings);
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return {
    settings,
    setSettings,
    isLoadingSettings,
    refreshSettings,
    updateSettings,
  };
}
