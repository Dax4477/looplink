# LoopLink Web v0.3 — GitHub Pages Edition

A static browser client compatible with the LoopLink Android v0.2 Cloudflare signaling API.

Default Worker:

`https://looplink-api.obserax.workers.dev`

## Features

- browser device registration
- permanent pairing
- pair code creation/join/approval
- Loop Listen
- Loop Transmit
- Talk Mode
- WebRTC P2P audio
- Cloudflare STUN/TURN obtained through the existing Worker
- mute
- volume
- audio-output selector where the browser exposes `setSinkId`
- automatic reconnect attempt
- installable PWA shell
- no build system required

## Host on GitHub Pages

Create a new GitHub repository, for example:

`looplink-web`

Copy all files in this folder into the repository root.

With Git installed:

```powershell
cd "C:\LoopLink\LoopLink-Web-GitHub-Pages"

git init
git add .
git commit -m "Initial LoopLink Web"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/looplink-web.git
git push -u origin main
```

Then on GitHub:

**Repository → Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save**

GitHub will give an HTTPS URL such as:

`https://YOUR_USERNAME.github.io/looplink-web/`

HTTPS is required for browser microphone access.

## First test with Android

1. Open the GitHub Pages URL in Chrome/Safari.
2. Press **Register this browser**.
3. On Android LoopLink create a pair code.
4. Enter that code in the web app and press **Join**.
5. On Android refresh pending requests and approve.
6. Refresh paired devices in the web app.
7. For Android → Web:
   - Android: `Start Loop - Transmit`
   - Web: `Loop Listen`
8. For Web → Android:
   - Web: `Loop Transmit`
   - Android: `Start Loop - Listen`
9. For Talk:
   - Press `Talk` on both sides.

## Important browser limits

### iPhone / iPad background microphone

The web version cannot guarantee continuous microphone transmission after Safari/PWA is backgrounded or the iPhone is locked. iOS can suspend browser execution.

Use the native app for reliable always-on background Loop Transmit.

### Phone earpiece routing

Web browsers do not reliably expose the built-in call earpiece as an output device. `setSinkId()` works only on browsers/platforms that expose audio outputs.

The native Android app remains the correct client for guaranteed:
- top earpiece
- loudspeaker
- Bluetooth communication routing
- locked-screen continuous transmission

### Identity storage

The browser's LoopLink device ID and secret are stored in the browser's local storage so the pairing survives refreshes.

Do not use the web client on a public/shared browser profile.

## Cloudflare Worker

The web app never contains your long-term Cloudflare TURN API token.

It asks your existing Worker for temporary ICE/TURN credentials using:

`POST /api/ice-servers`

Your Worker keeps the long-term TURN key secret.


## Multi-endpoint pairing

A single unexpired pair code from Android A can be used by Android B and this web browser.
Both appear as separate pending endpoints on Android A and both must be approved.

For simultaneous receiving:

- Android B starts Loop Listen against Android A.
- Web starts Loop Listen against Android A.
- Android A v0.3 presses **Start Loop Broadcast — ALL Paired Endpoints**.

Both receivers then get Android A's microphone at the same time over separate P2P WebRTC connections.
