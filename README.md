# shroomlive Stream Actions

The Twitch mobile view and desktop panel share the Neon-Myzel picker. Linked viewers can choose a mushroom animation, emote or sticker, or search GIPHY. A submission includes an optional 128-character message. The local desktop worker checks messages and GIPHY stills with OpenAI Moderation. A capture-protected desktop prompt handles flagged or unavailable checks. Ordinary insults alone do not trigger the prompt. Approved reactions play in order. The silent stage displays the approved image, Twitch name and message for ten seconds over the camera.

## Build and upload

Set the public build settings `VITE_API_URL` (production origin `https://shroomlive.de`) and `VITE_GIPHY_API_KEY`. Run `bun run build` and `bun run bundle.ts`. The ZIP contains the Twitch entries `mobile.html` and `panel.html`. The separate `stage-dist` directory contains the OBS local browser source `stage-local.html` and its relative assets. The declarative stream-control setup fits that source into the camera rectangle for each camera scene.

Twitch currently publishes 1.0.0 for extension `rzayw76j3drs9vzexj712achlc6bfi`. Create a 1.1.0 Hosted Test with Request Identity Link, the production backend origin in connect-src, and the GIPHY API and media origins in the matching allowlists. Use test accounts for a native Android check before submission for review. [Twitch release workflow](https://dev.twitch.tv/docs/extensions/life-cycle/).

## Run the backend

Run `bun service/server.ts` with `TWITCH_EXTENSION_SECRET` (the base64 signing secret for this exact extension), `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` supplied through the host's secret manager. Each can instead come from a file named in `TWITCH_EXTENSION_SECRET_FILE`, `TWITCH_CLIENT_ID_FILE` or `TWITCH_CLIENT_SECRET_FILE` (read once at start, trimmed; setting both forms is an error). Startup stops with the names of missing secrets. The latter two belong to the Helix application. The service verifies signed linked viewer tokens for channel 137290088, reads the current stream and viewer name from Helix and accepts moderation decisions only from the broadcaster. Session status uses Helix with a 15-second cache. The original 1.0.0 panel uses the legacy API and its separate stream database.

Build the runtime image from the repository root with `docker build -f service/Dockerfile -t shroomlive-stream-actions:1.1.0 .` after the frontend build. The container runs as user `bun` and checks itself through `GET /stream-actions/health` (`{"ok":true}`, no secrets, no database access). Run one replica with a persistent volume at `/data` (SQLite database and `reaction-photos/`) and route the existing site's `/stream-actions/` prefix to port 27019 on the private container network, preserving the prefix. Disable proxy buffering for the SSE stream at `/stream-actions/events`. It carries only the approved, currently visible reaction, including its expiry. The local OBS stage connects outbound to this feed.

The SQLite database holds per-stream submissions. The service accepts one submission per viewer and up to three per channel per minute. The review list expires entries after ten minutes. On submission, it prunes submission records older than one day. The active overlay is transient. The public frontend contains the GIPHY client key used for direct media searches and lookups.


## Reaction memories

While a reaction is visible, the capture-protected desktop display takes three webcam frames from the OBS source "Webcam" at 1.2, 2.2 and 3.2 seconds, at least one second apart and never later than five seconds after the first paint. Each shot is preceded by a private white flash for Robin. The frames go to `POST /stream-actions/camera/<id>/<frame>` and are stored per viewer next to a small note with the motif id. GIPHY media itself is never stored or proxied by the service ([GIPHY API: prohibited integration practices](https://developers.giphy.com/docs/api/)).

The panel shows the memory as an animated card: the motif plays straight from GIPHY (or the bundled mushroom), Robin's frames take turns above a small film strip, and GIPHY motifs carry the official "Powered by GIPHY" mark on a Neon-Myzel plate plus the creator's name where GIPHY provides one. "Als PNG speichern" builds a PNG in the viewer's browser with frame 1, a still of the motif and, for GIPHY, the same mark.
