# Production Validation Checklist

Record the production URL and test with a normal operator account, not a service-role key.

## Access

- [ ] `/login` loads without a blank screen.
- [ ] A magic link reaches the operator email and opens `/app`.
- [ ] Refreshing `/app` keeps the session active.
- [ ] Signing out returns to `/login`.
- [ ] An unauthenticated visit to `/app` returns to `/login`.

## Screens

- [ ] Create a screen and edit its name and location.
- [ ] Pair a TV using `/player`.
- [ ] Open the direct player link on a second browser.
- [ ] The screen reports Online within 30 seconds.
- [ ] Remote reload is acknowledged by the player.
- [ ] Delete a test screen and confirm its playlist is removed.

## Media

- [ ] Upload one image and one video.
- [ ] Preview both assets in the media library.
- [ ] Delete a test asset and confirm its Storage object is removed.
- [ ] Add and preview a YouTube, weather, clock, or website app.

## Playlists

- [ ] Add image, video, and app content to a screen playlist.
- [ ] Reorder items and edit duration and time windows.
- [ ] Confirm images advance on duration.
- [ ] Confirm videos and YouTube play to completion and restart on the next loop.
- [ ] Change the playlist while the player is open and confirm it updates within 30 seconds.

## Campaigns

- [ ] Create a campaign and add ordered content.
- [ ] Assign one or more screens.
- [ ] Publish and confirm each assigned screen receives the campaign playlist.
- [ ] Confirm upcoming, active, expired, and paused labels are correct.

## Templates

- [ ] Create and assign each preset layout.
- [ ] Create a canvas template with at least two zones.
- [ ] Move and resize zones, refresh, and confirm geometry persists.
- [ ] Assign mixed image and YouTube content and confirm multi-zone playback.
- [ ] Disable the assignment and confirm normal playlist playback returns.

## Recovery

- [ ] Temporarily use a bad media URL and confirm the player skips it instead of going blank.
- [ ] Disconnect and reconnect the TV network and confirm playback recovers.
- [ ] Refresh `/player/:screenId` and confirm the route still loads.
- [ ] Verify no service-role key or `.env` file exists in the deployed repository.
