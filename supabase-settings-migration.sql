-- Run this in the Supabase SQL editor.
-- Adds shared app/player customization settings.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_public_select'
  ) then
    create policy app_settings_public_select
    on public.app_settings
    for select
    to public
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_authenticated_insert'
  ) then
    create policy app_settings_authenticated_insert
    on public.app_settings
    for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_settings'
      and policyname = 'app_settings_authenticated_update'
  ) then
    create policy app_settings_authenticated_update
    on public.app_settings
    for update
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

insert into public.app_settings (key, value)
values
  ('brand_name', 'Nehas Advertising'),
  ('brand_subtitle', 'ነሃስ ማስታውቂያ'),
  ('player_footer_text', '© ነሃስ ማስታውቂያ። All rights reserved.'),
  ('developer_credit', 'Developed by Nebiyu Mekonnen'),
  ('player_background_url', '/nehas-bg.jpg'),
  ('default_item_duration_seconds', '10'),
  ('show_player_footer', 'true'),
  ('player_fit_mode', 'contain')
on conflict (key) do nothing;

grant select on public.app_settings to anon;
grant all on public.app_settings to authenticated;
