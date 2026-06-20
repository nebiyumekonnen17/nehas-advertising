import { supabase } from './supabase';

export type PlayerFitMode = 'contain' | 'cover';

export type AppSettings = {
  brandName: string;
  brandSubtitle: string;
  playerFooterText: string;
  developerCredit: string;
  playerBackgroundUrl: string;
  defaultItemDurationSeconds: number;
  showPlayerFooter: boolean;
  playerFitMode: PlayerFitMode;
};

export const DEFAULT_SETTINGS: AppSettings = {
  brandName: 'Nehas Advertising',
  brandSubtitle: 'ነሃስ ማስታውቂያ',
  playerFooterText: '© ነሃስ ማስታውቂያ። All rights reserved.',
  developerCredit: 'This system Designed By Nebiyu Mekonnen',
  playerBackgroundUrl: '/nehas-bg.jpg',
  defaultItemDurationSeconds: 10,
  showPlayerFooter: true,
  playerFitMode: 'contain',
};

const SETTING_KEYS: Record<keyof AppSettings, string> = {
  brandName: 'brand_name',
  brandSubtitle: 'brand_subtitle',
  playerFooterText: 'player_footer_text',
  developerCredit: 'developer_credit',
  playerBackgroundUrl: 'player_background_url',
  defaultItemDurationSeconds: 'default_item_duration_seconds',
  showPlayerFooter: 'show_player_footer',
  playerFitMode: 'player_fit_mode',
};

const KEY_TO_SETTING = Object.entries(SETTING_KEYS).reduce<Record<string, keyof AppSettings>>(
  (map, [settingKey, dbKey]) => {
    map[dbKey] = settingKey as keyof AppSettings;
    return map;
  },
  {},
);

function parseSettingValue(key: keyof AppSettings, value: string): AppSettings[keyof AppSettings] {
  if (key === 'defaultItemDurationSeconds') {
    return Math.max(1, Number(value) || DEFAULT_SETTINGS.defaultItemDurationSeconds);
  }

  if (key === 'showPlayerFooter') {
    return value === 'true';
  }

  if (key === 'playerFitMode') {
    return value === 'cover' ? 'cover' : 'contain';
  }

  return value;
}

function serializeSettingValue(value: AppSettings[keyof AppSettings]): string {
  return String(value);
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (!supabase) return DEFAULT_SETTINGS;

  const { data, error } = await supabase.from('app_settings').select('key, value');
  if (error) {
    return DEFAULT_SETTINGS;
  }

  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  for (const row of data ?? []) {
    const settingKey = KEY_TO_SETTING[row.key];
    if (!settingKey) continue;
    settings[settingKey] = parseSettingValue(settingKey, row.value) as never;
  }

  return settings;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const rows = Object.entries(SETTING_KEYS).map(([settingKey, dbKey]) => ({
    key: dbKey,
    value: serializeSettingValue(settings[settingKey as keyof AppSettings]),
  }));

  const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}
