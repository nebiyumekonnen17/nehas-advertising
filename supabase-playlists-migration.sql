-- Run in the Supabase SQL editor.
-- Adds reusable playlists while preserving existing screen-specific playlist_items.

create table if not exists public.playlists (
  id uuid not null default extensions.uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone not null default now(),
  constraint playlists_pkey primary key (id)
);

alter table public.playlist_items
  add column if not exists playlist_id uuid null references public.playlists(id) on delete cascade;

create unique index if not exists playlist_items_playlist_order_key
  on public.playlist_items (playlist_id, display_order)
  where playlist_id is not null;

create table if not exists public.screen_playlist_assignments (
  id uuid not null default extensions.uuid_generate_v4(),
  screen_id uuid not null references public.screens(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  constraint screen_playlist_assignments_pkey primary key (id),
  constraint screen_playlist_assignments_screen_key unique (screen_id)
);

alter table public.screen_template_zones
  add column if not exists playlist_id uuid null references public.playlists(id) on delete set null;

alter table public.playlists enable row level security;
alter table public.screen_playlist_assignments enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['playlists', 'screen_playlist_assignments']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target_table
        and policyname = target_table || '_authenticated_all'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        target_table || '_authenticated_all', target_table
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = target_table
        and policyname = target_table || '_public_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to public using (true)',
        target_table || '_public_select', target_table
      );
    end if;
  end loop;
end $$;

grant select on public.playlists to anon;
grant select on public.screen_playlist_assignments to anon;
grant all on public.playlists to authenticated;
grant all on public.screen_playlist_assignments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'playlists'
  ) then
    alter publication supabase_realtime add table public.playlists;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'screen_playlist_assignments'
  ) then
    alter publication supabase_realtime add table public.screen_playlist_assignments;
  end if;
end $$;
