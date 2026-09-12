# LoopLink Web v0.4.0

GitHub Pages / static browser client for LoopLink v0.4 WebSocket signaling.

## What changed

- Pairing/device records remain in the existing Cloudflare D1 database.
- Active WebRTC signaling uses a Durable Object WebSocket room instead of polling `/api/sessions/*`.
- The listener can wait on one hibernatable WebSocket without repeated session/candidate GET requests.
- SDP and ICE candidates are relayed as short-lived WebSocket messages and are not stored in D1.
- TURN credentials are fetched only when both endpoints are ready to negotiate.
- Existing browser identity in localStorage is preserved when these files replace v0.3.1 on the same GitHub Pages origin.

Replace the existing GitHub Pages files with this folder's files and commit/push. Do not change the Pages origin if you want the existing browser identity to remain.

Mobile browser background limitations remain: iOS/Safari can suspend a web page when backgrounded or locked. Native Android is the reliable background endpoint.
