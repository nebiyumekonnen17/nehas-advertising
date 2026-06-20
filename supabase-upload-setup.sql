-- Run this in the Supabase SQL editor.
-- It creates the public Storage bucket used by the React app and grants upload access
-- to signed-in operators. It does not add new app tables.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update
set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_public_select'
  ) then
    create policy media_public_select
    on storage.objects
    for select
    to public
    using (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_insert'
  ) then
    create policy media_authenticated_insert
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_update'
  ) then
    create policy media_authenticated_update
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'media')
    with check (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_delete'
  ) then
    create policy media_authenticated_delete
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'media_authenticated_update'
  ) then
    create policy media_authenticated_update
    on public.media
    for update
    to authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'media_authenticated_delete'
  ) then
    create policy media_authenticated_delete
    on public.media
    for delete
    to authenticated
    using (true);
  end if;
end $$;

grant select on public.media to anon;
grant all on public.media to authenticated;

-- If Row Level Security is enabled on public.media, also run these policies.
-- They are safe to keep even if your app is a single shared workspace.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'media_authenticated_select'
  ) then
    create policy media_authenticated_select
    on public.media
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'media'
      and policyname = 'media_authenticated_insert'
  ) then
    create policy media_authenticated_insert
    on public.media
    for insert
    to authenticated
    with check (true);
  end if;
end $$;
