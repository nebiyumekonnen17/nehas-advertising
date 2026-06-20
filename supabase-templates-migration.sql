-- Run this in the Supabase SQL editor.
-- Adds multi-zone screen templates while keeping simple playlists unchanged.

create table if not exists public.screen_templates (
  id uuid not null default extensions.uuid_generate_v4(),
  name text not null,
  layout_type text not null default 'split',
  created_at timestamp with time zone null default now(),
  constraint screen_templates_pkey primary key (id),
  constraint screen_templates_layout_type_check check (
    layout_type = any (array['full', 'split', 'sidebar', 'grid', 'banner', 'canvas'])
  )
);

create table if not exists public.screen_template_zones (
  id uuid not null default extensions.uuid_generate_v4(),
  template_id uuid null references public.screen_templates(id) on delete cascade,
  zone_key text not null,
  media_id uuid null references public.media(id) on delete set null,
  fit_mode text null default 'contain',
  background_color text null default '#020617',
  sort_order integer null default 0,
  x numeric null default 0,
  y numeric null default 0,
  width numeric null default 50,
  height numeric null default 50,
  z_index integer null default 1,
  border_radius integer null default 0,
  constraint screen_template_zones_pkey primary key (id),
  constraint screen_template_zones_template_id_zone_key_key unique (template_id, zone_key),
  constraint screen_template_zones_fit_mode_check check (
    fit_mode = any (array['contain', 'cover'])
  )
);

alter table public.screen_template_zones
  add column if not exists x numeric null default 0,
  add column if not exists y numeric null default 0,
  add column if not exists width numeric null default 50,
  add column if not exists height numeric null default 50,
  add column if not exists z_index integer null default 1,
  add column if not exists border_radius integer null default 0;

do $$
begin
  alter table public.screen_templates
    drop constraint if exists screen_templates_layout_type_check;

  alter table public.screen_templates
    add constraint screen_templates_layout_type_check check (
      layout_type = any (array['full', 'split', 'sidebar', 'grid', 'banner', 'canvas'])
    );
end $$;

create table if not exists public.screen_template_assignments (
  id uuid not null default extensions.uuid_generate_v4(),
  screen_id uuid null references public.screens(id) on delete cascade,
  template_id uuid null references public.screen_templates(id) on delete cascade,
  active boolean not null default true,
  constraint screen_template_assignments_pkey primary key (id),
  constraint screen_template_assignments_screen_template_key unique (screen_id, template_id)
);

create unique index if not exists screen_template_assignments_one_active_screen
  on public.screen_template_assignments (screen_id)
  where active = true;

alter table public.screen_templates enable row level security;
alter table public.screen_template_zones enable row level security;
alter table public.screen_template_assignments enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['screen_templates', 'screen_template_zones', 'screen_template_assignments']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = target_table || '_authenticated_all'
    ) then
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true)',
        target_table || '_authenticated_all',
        target_table
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = target_table || '_public_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to public using (true)',
        target_table || '_public_select',
        target_table
      );
    end if;
  end loop;
end $$;

grant select on public.screen_templates to anon;
grant select on public.screen_template_zones to anon;
grant select on public.screen_template_assignments to anon;
grant all on public.screen_templates to authenticated;
grant all on public.screen_template_zones to authenticated;
grant all on public.screen_template_assignments to authenticated;
