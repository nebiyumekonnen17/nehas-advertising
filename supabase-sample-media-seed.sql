-- Run this in the Supabase SQL editor after the base media table exists.
-- Adds starter content for template gallery previews.
-- Pexels photos/videos are free to use under the Pexels License:
-- https://www.pexels.com/license/

insert into public.media (file_name, file_url, media_type)
select 'Sample photo - Pexels rocks', 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'image'
where not exists (
  select 1 from public.media
  where file_url = 'https://images.pexels.com/photos/2014422/pexels-photo-2014422.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
);

insert into public.media (file_name, file_url, media_type)
select 'Sample photo - Pexels landscape', 'https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'image'
where not exists (
  select 1 from public.media
  where file_url = 'https://images.pexels.com/photos/2880507/pexels-photo-2880507.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'
);

insert into public.media (file_name, file_url, media_type)
select 'Sample video - Big Buck Bunny', 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4', 'video'
where not exists (
  select 1 from public.media
  where file_url = 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'
);

insert into public.media (file_name, file_url, media_type)
select 'Sample app - Weather Addis Ababa', 'app://weather?name=Addis%20Ababa%2C%20Ethiopia&lat=9.03&lon=38.74', 'url'
where not exists (
  select 1 from public.media
  where file_url = 'app://weather?name=Addis%20Ababa%2C%20Ethiopia&lat=9.03&lon=38.74'
);

insert into public.media (file_name, file_url, media_type)
select 'Sample app - Clock', 'app://clock?label=Nehas%20Advertising', 'url'
where not exists (
  select 1 from public.media
  where file_url = 'app://clock?label=Nehas%20Advertising'
);

insert into public.media (file_name, file_url, media_type)
select 'Sample app - YouTube Big Buck Bunny', 'app://youtube?videoId=aqz-KE-bpKQ', 'url'
where not exists (
  select 1 from public.media
  where file_url = 'app://youtube?videoId=aqz-KE-bpKQ'
);
