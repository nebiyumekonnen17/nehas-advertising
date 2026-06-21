# Nehas Advertising (ነሃስ ማስታወቂያ)

React, Vite, and Supabase digital signage for managing screens, media, playlists, campaigns, templates, and TV playback.

## Production

- Admin login: https://nehas-advertising.vercel.app/login
- TV pairing: https://nehas-advertising.vercel.app/player
- Direct players: `https://nehas-advertising.vercel.app/player/{screenId}`

## Local Start

1. Copy `.env.example` to `.env`.
2. Add the Supabase project URL and anonymous key.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

`VITE_SUPABASE_URL` must be the project API URL, such as `https://project-ref.supabase.co`. Do not add `/auth/v1` or a dashboard path.

## Routes

- `/login` - operator email sign-in.
- `/app` - protected operator console.
- `/player` - TV pairing page.
- `/player/:screenId` - direct fullscreen player.

## Legacy TV Player

Player routes run an ES5-safe capability check before React loads. Supported browsers continue to use the modern player. Older browsers automatically use the lightweight legacy player, which supports pairing, images, videos, playlist rotation, published campaign content, 30-second manifest polling, and screen health reporting. Apps, YouTube, and multi-zone templates are skipped gracefully on legacy devices.

Use `?legacy=1` on a player URL to test the fallback or `?modern=1` to force the modern player during diagnostics.

## Supabase Setup

Run the SQL files in this order:

1. `supabase-screen-health-migration.sql`
2. `supabase-upload-setup.sql`
3. `supabase-campaigns-migration.sql`
4. `supabase-templates-migration.sql`
5. `supabase-playlists-migration.sql`
6. `supabase-settings-migration.sql`
7. `supabase-sample-media-seed.sql` (optional starter content)
8. `supabase-production-setup.sql`

The final production setup enables the access policies and realtime tables needed by anonymous TV players and authenticated operators.

## Large Video Uploads

Videos larger than 45 MB are compressed in the operator's browser before upload. Compression produces a muted MP4 up to 1280 pixels wide and targets a file size below the Supabase Free-plan limit. The FFmpeg engine loads only when compression is needed.

## Deployment Guide

See [DEPLOYMENT.md](DEPLOYMENT.md) for Supabase Auth and Vercel setup. Use [VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md) before handing the system to operators.

Never commit `.env`, service-role keys, passwords, or private credentials. The frontend must use only the Supabase anonymous key.
