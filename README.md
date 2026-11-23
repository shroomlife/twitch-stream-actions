# shroomlive Stream Actions

The Twitch mobile view and desktop panel share the Neon-Myzel picker. Linked viewers choose a mushroom animation, emote or sticker from our own collection, or search GIPHY, and may add a message of up to 128 characters. Stream Actions works on one channel only, theshroomlife (137290088); on any other channel the panel shows "Stream Actions gibt es nur bei theshroomlife." and calls no backend.

## How a submission reaches the stream

1. The panel sends the motif id and the message to `POST /stream-actions/send`. The service accepts one submission per viewer per minute and at most 20 waiting submissions per stream; a viewer over the limit gets a German refusal before any Twitch API call.
2. The desktop worker on Robin's PC (`service/moderation-worker.ts`) checks the text (motif title and message) with OpenAI Moderation (`omni-moderation-latest`). For a GIPHY motif it also sends one still frame: the worker asks the GIPHY API directly for that id with `rating=g`, accepts it only if GIPHY answers with rating `g`, and passes the `fixed_height_still` URL unmodified (allowlisted GIPHY host only) to OpenAI. The service itself never contacts GIPHY. A message that looks like advertising with a link is also held.
3. The switch "Automatisch freigeben nach Prüfung" decides what happens next. It is on by default, sits in the tray menu of the desktop reaction display, is stored locally on Robin's PC and mirrored to the service, which stores it per broadcaster and applies it to every verdict. Only the authenticated desktop channel can change it.
   - On: a submission without findings goes on stream; a flagged submission, or one whose check was unavailable, waits for Robin.
   - Off: every submission waits for Robin's decision, whatever the check found.
4. Waiting submissions open Robin's capture-protected review window ("Im Stream zeigen?") with the reason. Each decision is asked once and recorded idempotently by id.
5. Approved reactions play in order for ten seconds each on the silent OBS stage (image, Twitch name, avatar, message). Each event frame carries the remaining display time, so the stage and the desktop capture time themselves by arrival, not by the server clock.
6. "Entfernen" in the same tray menu removes the reaction that is on screen (it ends immediately on the stage over SSE) or any waiting one. A removed reaction is never shown or replayed.

The OpenAI check does not flag the category "harassment" alone, so ordinary banter can pass automatically while the switch is on. With the switch off nothing reaches the stream without Robin seeing it first.

## Reaction memories

While a reaction is visible, the capture-protected desktop display takes three webcam frames from the OBS source "Webcam" at 1.2, 2.2 and 3.2 seconds, at least one second apart and never later than five seconds after the first paint. Each shot is preceded by a private white flash for Robin. The frames go to `POST /stream-actions/camera/<id>/<frame>` and are stored per viewer next to a small note with the motif id. Memories are deleted after 90 days; the deletion runs after new frames are written.

The panel shows the memories as a gallery: Robin's three frames take turns above a small film strip, together with the motif. A mushroom motif comes from the extension bundle. A GIPHY is looked up live by its id and hotlinked from GIPHY, with the "Powered by GIPHY" mark and the creator's name where GIPHY provides one. GIPHY media is never stored, cached or proxied ([GIPHY API: prohibited integration practices](https://developers.giphy.com/docs/api/)). There is no image export or download.

## Data

- Submissions (Twitch user id, display name and avatar URL from Helix, motif id, message, state) live in SQLite and are deleted after one day. The review queue expires entries after ten minutes.
- Reaction memories (Robin's camera frames plus the motif id) are kept per viewer for 90 days.
- Display names are cached in memory for ten minutes.
- The approval switch is the only setting stored by the service.

## URLs the extension uses (Twitch console allowlists)

The panel loads scripts and styles only from its own bundle plus the Twitch helper. It contacts exactly these origins, and the code accepts GIPHY media only from the hosts below (`src/media-hosts.ts`):

| Allowlist | Entries |
|---|---|
| URL Fetching Domains (connect-src) | `https://actions.shroomlive.de`, `https://api.giphy.com` |
| Image Domains | `https://media.giphy.com`, `https://media0.giphy.com`, `https://media1.giphy.com`, `https://media2.giphy.com`, `https://media3.giphy.com`, `https://media4.giphy.com`, `https://i.giphy.com` |
| Media Domains | none |

`static-cdn.jtvnw.net` (Twitch avatars) is used only by the OBS stage, not by the extension.

## Build and upload

Set the public build settings `VITE_API_URL=https://actions.shroomlive.de` and `VITE_GIPHY_API_KEY` (CI reads them from the repository variable and secret; locally from `.env.production`, which is not committed). Run `bun run build` and `bun run bundle.ts`. The ZIP contains the Twitch entries `mobile.html` and `panel.html`. The separate `stage-dist` directory contains the OBS local browser source `stage-local.html` and its relative assets.

CI (`.github/workflows/main.yml`) runs `bun test service`, builds the frontend, pushes the image `shroomlife/stream-actions:<sha>` and uploads the ZIP as an artifact.

Twitch currently publishes 1.0.0 for extension `rzayw76j3drs9vzexj712achlc6bfi`. Create a 1.1.0 Hosted Test with Request Identity Link and the allowlists above, and check it on Android with test accounts before submitting for review ([Twitch release workflow](https://dev.twitch.tv/docs/extensions/life-cycle/)).

## Run the backend

Run `bun service/server.ts` with `TWITCH_EXTENSION_SECRET` (the base64 signing secret of this extension), `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` from the host's secret manager. Each can instead come from a file named in `TWITCH_EXTENSION_SECRET_FILE`, `TWITCH_CLIENT_ID_FILE` or `TWITCH_CLIENT_SECRET_FILE` (read once at start, trimmed; setting both forms is an error). Startup stops with the names of missing secrets.

Optional settings:

- `PUBLIC_BASE_URL` (default `https://actions.shroomlive.de`): the one public origin, used for the EventSub callback `<origin>/stream-actions/twitch-status`. The desktop worker and the camera uploader use the same default.
- `CLIENT_IP_HEADER`: header the reverse proxy sets with the viewer's address (for example `x-real-ip`). It is used for the SSE connection cap (6 per address, 300 in total). Without it the socket address counts.

The service verifies signed viewer tokens for channel 137290088. Moderation results, decisions, the approval switch and removals come only over the desktop channel, authenticated with a key derived from the extension secret. Per-user limits apply to `/send`, `/auth`, `/memories` and `/memory`. The live status comes from EventSub `stream.online`/`stream.offline`; Helix `streams` is only asked (cached 15 seconds) until the first EventSub message after a start, and never overrides a newer EventSub transition.

Build the runtime image from the repository root with `docker build -f service/Dockerfile -t shroomlive-stream-actions:1.1.0 .` after the frontend build. The container runs as user `bun` and checks itself through `GET /stream-actions/health` (`{"ok":true}`, no secrets, no database access). Run one replica with a persistent volume at `/data` (SQLite database and `reaction-photos/`) and route `https://actions.shroomlive.de/stream-actions/` to port 27019 on the private container network, preserving the prefix. Disable proxy buffering for the SSE stream at `/stream-actions/events`. It carries only the approved reaction that is visible now, with its remaining time.

## Desktop tools

`Stream-Actions-Vorschau.cmd` starts the capture-protected reaction display (`service/desktop-display.cjs`) with its tray menu and the moderation worker. The worker needs the OpenAI key (`openai-api-key`) and the desktop key in the Windows Credential Manager (service `stream-control`).

`Stream-Actions-Zugang.cmd` asks for the extension secret from the Twitch console and stores only the derived desktop key (`stream-actions-desktop-key`). A PC that still holds the raw secret under `twitch-extension-secret` migrates on the next worker start: the key is derived and stored, the raw entry is deleted, and the worker logs a notice.

## Cutover to actions.shroomlive.de

1. Route `https://actions.shroomlive.de/stream-actions/` to the container as above (set `CLIENT_IP_HEADER` to the proxy's address header).
2. Bring the EventSub webhooks in line: `bun service/eventsub-setup.ts` (dry run) lists the existing `stream.online`/`stream.offline` subscriptions for 137290088 and prints the plan; `bun service/eventsub-setup.ts --apply` deletes those with another callback, another version, a status other than `enabled` or duplicates, and creates the missing ones (webhook transport, callback `${PUBLIC_BASE_URL}/stream-actions/twitch-status`, secret derived from the extension secret). It needs the same Twitch secrets as the service and never prints them. Run it where those secrets are available, for example inside the container.
3. Set `VITE_API_URL=https://actions.shroomlive.de` in the local `.env.production` (the CI variable already has it).
4. Update the Twitch console allowlists, upload the new ZIP to the Hosted Test, and restart the desktop display so the worker migrates its key.

## Review notes

Text for the Twitch review notes field:

> Stream Actions is built for a single channel: theshroomlife (broadcaster id 137290088). On any other channel the panel only shows a short notice that the extension exists for theshroomlife, and it makes no backend calls. To test, open the extension on twitch.tv/theshroomlife (panel and mobile). Viewers must share their Twitch identity (Request Identity Link) to send a reaction.
>
> While the channel is live, a viewer picks one of our own mushroom animations, emotes or stickers, or a GIPHY (searched with rating g), and may add a short message. Every submission is checked with OpenAI Moderation (text, plus a still frame for GIPHY motifs). The broadcaster has a switch "auto-approve after check" in his desktop tool, on by default: when on, submissions without findings are shown; flagged submissions, or those whose check failed, wait for his manual approval. When off, every submission waits for his approval. The broadcaster can remove the reaction currently on screen or any waiting one at any time; removed reactions are never shown again. Approved reactions appear for ten seconds on the stream overlay with the viewer's Twitch name.
>
> While a reaction is on screen, the broadcaster's webcam takes three frames of his reaction; the viewer sees them later in the panel together with the motif (GIPHY shown live from GIPHY with "Powered by GIPHY"). These memories are deleted after 90 days; submissions after one day. One submission per viewer per minute.
