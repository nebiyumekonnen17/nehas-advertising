-- Run this in the Supabase SQL editor.
-- Adds lightweight player health and remote reload fields to the existing screens table.

alter table public.screens
  add column if not exists player_status text default 'idle',
  add column if not exists current_media_id uuid null references public.media(id) on delete set null,
  add column if not exists player_message text null,
  add column if not exists player_error text null,
  add column if not exists player_version text null,
  add column if not exists reload_requested_at timestamp with time zone null,
  add column if not exists reload_acknowledged_at timestamp with time zone null;

create index if not exists screens_current_media_id_idx
  on public.screens (current_media_id);

create index if not exists screens_reload_requested_at_idx
  on public.screens (reload_requested_at);
