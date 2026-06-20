# Production Deployment

This guide deploys Nehas Advertising to Vercel with Supabase as the backend and media store.

## Live Deployment

- Production URL: https://nehas-advertising.vercel.app
- Vercel project: `team-neb/nehas-advertising`
- Supabase project: `Nehas Media Signage` (`ynkrloxlyradjbdqdaam`)

## 1. Prepare Supabase

Open the Supabase SQL Editor and run these files in order:

1. `supabase-screen-health-migration.sql`
2. `supabase-upload-setup.sql`
3. `supabase-campaigns-migration.sql`
4. `supabase-templates-migration.sql`
5. `supabase-settings-migration.sql`
6. `supabase-sample-media-seed.sql` (optional)
7. `supabase-production-setup.sql`

The setup creates or updates the `media` Storage bucket, enables operator policies, grants public read access required by TV players, limits anonymous screen updates to player health fields, and enables realtime updates.

## 2. Configure Authentication

In Supabase, open **Authentication > URL Configuration**.

- During local testing, add `http://localhost:5173/app` to Redirect URLs.
- After deployment, set Site URL to the production domain.
- Add `https://YOUR-DOMAIN/app` to Redirect URLs.

Keep the email provider enabled. The login page sends a magic link to the operator email.

## 3. Configure Environment Variables

Create local `.env` values from `.env.example`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Use the project anonymous key only. Never use the Supabase service-role key in this React app.

## 4. Validate Locally

```bash
npm install
npm run build
npm run preview
```

Open the preview URL and complete the checks in `VALIDATION_CHECKLIST.md`.

## 5. Deploy To Vercel

1. Put the project in a private GitHub repository.
2. Import the repository into Vercel.
3. Keep Framework Preset as **Vite**.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings.
5. Deploy.
6. Add the final Vercel URL to Supabase Auth Site URL and Redirect URLs.
7. Redeploy only if environment variables changed after the first build.

`vercel.json` preserves `/app`, `/player`, and `/player/:screenId` when a browser refreshes a direct route.

## 6. TV Setup

1. Create a screen in the admin console.
2. Open the screen details.
3. On the TV browser, open the Pairing page link and enter the code, or open the Direct player link.
4. Enable kiosk/fullscreen mode in the TV browser.
5. Confirm the screen becomes Online within 30 seconds.

## Troubleshooting

### Login says "Invalid path specified"

Use only the Supabase project API URL in `VITE_SUPABASE_URL`. Restart the local server after changing `.env`.

### Magic link returns to the wrong page

Add the exact `/app` URL to Supabase Auth Redirect URLs and set the production Site URL.

### Upload or delete is blocked

Rerun `supabase-upload-setup.sql`, then `supabase-production-setup.sql`. Confirm the `media` bucket is public.

### TV shows Offline while playing

Rerun `supabase-screen-health-migration.sql` and `supabase-production-setup.sql`. Keep the player page open and wait up to 30 seconds.

### Canvas positions reset

Rerun `supabase-templates-migration.sql`, refresh the admin app, then save the zone again.

### Player does not update automatically

Rerun `supabase-production-setup.sql` to add the playback tables to Supabase Realtime. The player also polls every 30 seconds as a fallback.

### Website app is blank

Some websites block iframe embedding with their security headers. Use a site that permits embedding or upload the content as media.
