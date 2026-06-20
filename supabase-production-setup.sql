-- Run this after all other Nehas migrations.
-- It hardens production access for the public TV player and authenticated operators.

alter table public.screens enable row level security;
alter table public.media enable row level security;
alter table public.playlist_items enable row level security;

drop policy if exists screens_authenticated_all on public.screens;
create policy screens_authenticated_all
on public.screens for all to authenticated
using (true) with check (true);

drop policy if exists screens_player_select on public.screens;
create policy screens_player_select
on public.screens for select to anon
using (true);

drop policy if exists screens_player_update on public.screens;
create policy screens_player_update
on public.screens for update to anon
using (true) with check (true);

drop policy if exists media_authenticated_all on public.media;
create policy media_authenticated_all
on public.media for all to authenticated
using (true) with check (true);

drop policy if exists media_player_select on public.media;
create policy media_player_select
on public.media for select to anon
using (true);

drop policy if exists playlist_items_authenticated_all on public.playlist_items;
create policy playlist_items_authenticated_all
on public.playlist_items for all to authenticated
using (true) with check (true);

drop policy if exists playlist_items_player_select on public.playlist_items;
create policy playlist_items_player_select
on public.playlist_items for select to anon
using (true);

revoke all on public.screens from anon;
grant select on public.screens to anon;
grant update (
  last_seen,
  is_paired,
  player_status,
  current_media_id,
  player_message,
  player_error,
  player_version,
  reload_acknowledged_at
) on public.screens to anon;

revoke all on public.media from anon;
grant select on public.media to anon;

revoke all on public.playlist_items from anon;
grant select on public.playlist_items to anon;

grant all on public.screens to authenticated;
grant all on public.media to authenticated;
grant all on public.playlist_items to authenticated;

grant select on public.screen_templates to anon;
grant select on public.screen_template_zones to anon;
grant select on public.screen_template_assignments to anon;
grant select on public.app_settings to anon;

grant all on public.screen_templates to authenticated;
grant all on public.screen_template_zones to authenticated;
grant all on public.screen_template_assignments to authenticated;
grant all on public.app_settings to authenticated;
grant all on public.campaigns to authenticated;
grant all on public.campaign_items to authenticated;
grant all on public.campaign_screens to authenticated;

alter table public.screens replica identity full;
alter table public.media replica identity full;
alter table public.playlist_items replica identity full;
alter table public.screen_templates replica identity full;
alter table public.screen_template_zones replica identity full;
alter table public.screen_template_assignments replica identity full;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'screens',
    'media',
    'playlist_items',
    'screen_templates',
    'screen_template_zones',
    'screen_template_assignments'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end $$;
