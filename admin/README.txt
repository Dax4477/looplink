LoopLink Control Plane v0.9 — Admin UI upgrade

Included:
- admin.html
- admin.css
- admin.js

Preserved:
- Existing Worker URL/token flow
- Endpoint approve/reject
- Endpoint router/link removal
- Android mode Apply
- Refresh Config
- Check Update
- Pulse
- Existing pair/WebRTC/audio behavior (frontend does not rewrite it)

New UI:
- Unified Endpoint Registry + Native Android controls
- Search, filters and sort
- Expandable endpoint details
- Copy Endpoint ID / permanent PIN
- Clear device state confirmation
- Delete endpoint danger confirmation requiring DELETE
- Responsive layout
- Duplicate/stale endpoint management is much easier

Required Worker routes for new Clear/Delete actions:
POST   /api/admin/devices/:deviceId/clear
DELETE /api/admin/endpoints/:endpointId

Until those two Worker routes exist, the UI will show a clear error rather than pretending the operation succeeded.

Recommended CLEAR semantics:
Preserve device record, device secret/identity, permanent PIN and registration.
Reset only temporary audio/session/runtime/pending state.

Recommended DELETE semantics:
Delete/detach the selected endpoint and its endpoint-router links in one transaction.
Apply your intended pair/device cleanup policy deliberately.
A still-installed Android client may register again if your backend permits it.
