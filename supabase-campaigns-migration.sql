-- Run this in the Supabase SQL editor.
-- Adds campaign management without changing the existing player playlist model.

create table if not exists public.campaigns (
  id uuid not null default extensions.uuid_generate_v4(),
  name text not null,
  customer_name text null,
  start_date date null,
  end_date date null,
  is_active boolean not null default true,
  created_at timestamp with time zone null default now(),
  constraint campaigns_pkey primary key (id)
);

create table if not exists public.campaign_items (
  id uuid not null default extensions.uuid_generate_v4(),
  campaign_id uuid null references public.campaigns(id) on delete cascade,
  media_id uuid null references public.media(id) on delete cascade,
  display_order integer not null,
  duration_seconds integer null default 10,
  start_time text null default '00:00',
  end_time text null default '23:59',
  constraint campaign_items_pkey primary key (id),
  constraint campaign_items_campaign_id_display_order_key unique (campaign_id, display_order)
);

create table if not exists public.campaign_screens (
  id uuid not null default extensions.uuid_generate_v4(),
  campaign_id uuid null references public.campaigns(id) on delete cascade,
  screen_id uuid null references public.screens(id) on delete cascade,
  constraint campaign_screens_pkey primary key (id),
  constraint campaign_screens_campaign_id_screen_id_key unique (campaign_id, screen_id)
);

alter table public.campaigns enable row level security;
alter table public.campaign_items enable row level security;
alter table public.campaign_screens enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array['campaigns', 'campaign_items', 'campaign_screens']
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
  end loop;
end $$;

grant all on public.campaigns to authenticated;
grant all on public.campaign_items to authenticated;
grant all on public.campaign_screens to authenticated;
