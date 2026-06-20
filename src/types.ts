export type Screen = {
  id: string;
  name: string | null;
  location: string | null;
  last_seen: string | null;
  pairing_code: string | null;
  is_paired: boolean | null;
  player_status: string | null;
  current_media_id: string | null;
  player_message: string | null;
  player_error: string | null;
  player_version: string | null;
  reload_requested_at: string | null;
  reload_acknowledged_at: string | null;
};

export type MediaType = 'image' | 'video' | 'url' | 'image/*';

export type Media = {
  id: string;
  file_name: string;
  file_url: string;
  media_type: MediaType | null;
  created_at: string | null;
};

export type PlaylistItem = {
  id: string;
  screen_id: string | null;
  media_id: string | null;
  display_order: number;
  duration_seconds: number | null;
  duration: number | null;
  start_time: string | null;
  end_time: string | null;
  media?: Media | null;
};

export type Toast = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

export type Campaign = {
  id: string;
  name: string;
  customer_name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

export type CampaignItem = {
  id: string;
  campaign_id: string | null;
  media_id: string | null;
  display_order: number;
  duration_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
  media?: Media | null;
};

export type CampaignScreen = {
  id: string;
  campaign_id: string | null;
  screen_id: string | null;
};

export type TemplateLayoutType = 'full' | 'split' | 'sidebar' | 'grid' | 'banner' | 'canvas';

export type ScreenTemplate = {
  id: string;
  name: string;
  layout_type: TemplateLayoutType;
  created_at: string | null;
};

export type ScreenTemplateZone = {
  id: string;
  template_id: string | null;
  zone_key: string;
  media_id: string | null;
  fit_mode: 'contain' | 'cover' | null;
  background_color: string | null;
  sort_order: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  z_index: number | null;
  border_radius: number | null;
  media?: Media | null;
};

export type ScreenTemplateAssignment = {
  id: string;
  screen_id: string | null;
  template_id: string | null;
  active: boolean | null;
  screen_template?: ScreenTemplate | null;
};
