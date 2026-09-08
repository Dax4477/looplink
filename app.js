(() => {
  "use strict";

  const DEFAULT_API = "https://looplink-api.obserax.workers.dev";
  const IDENTITY_KEY = "looplink.web.identity.v1";
  const API_KEY = "looplink.web.api.v1";
  const NAME_KEY = "looplink.web.name.v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    cloudBadge: $("cloudBadge"),
    sessionDot: $("sessionDot"),
    sessionState: $("sessionState"),
    sessionDetail: $("sessionDetail"),
    peerStateBadge: $("peerStateBadge"),
    deviceName: $("deviceName"),
    registerBtn: $("registerBtn"),
    resetIdentityBtn: $("resetIdentityBtn"),
    identityStatus: $("identityStatus"),
    identityId: $("identityId"),
    createCodeBtn: $("createCodeBtn"),
    pairCode: $("pairCode"),
    joinCode: $("joinCode"),
    joinBtn: $("joinBtn"),
    refreshPendingBtn: $("refreshPendingBtn"),
    pendingList: $("pendingList"),
    refreshPairsBtn: $("refreshPairsBtn"),
    pairSelect: $("pairSelect"),
    listenBtn: $("listenBtn"),
    transmitBtn: $("transmitBtn"),
    talkBtn: $("talkBtn"),
    stopBtn: $("stopBtn"),
    muteBtn: $("muteBtn"),
    volumeSlider: $("volumeSlider"),
    outputSelect: $("outputSelect"),
    enableAudioBtn: $("enableAudioBtn"),
    remoteAudio: $("remoteAudio"),
    apiUrl: $("apiUrl"),
    saveApiBtn: $("saveApiBtn"),
    clearLogBtn: $("clearLogBtn"),
    log: $("log"),
    toast: $("toast"),
  };

  const state = {
    identity: loadJson(IDENTITY_KEY),
    pairs: [],
    pending: [],
    session: null,
    token: 0,
  };

  function apiBase() {
    return (localStorage.getItem(API_KEY) || DEFAULT_API).replace(/\/+$/, "");
  }

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function saveIdentity(identity) {
    state.identity = identity;
    if (identity) localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    else localStorage.removeItem(IDENTITY_KEY);
    renderIdentity();
  }

  function log(message, data) {
    const stamp = new Date().toLocaleTimeString();
    let line = `[${stamp}] ${message}`;
    if (data !== undefined) {
      try { line += ` ${typeof data === "string" ? data : JSON.stringify(data)}`; }
      catch {}
    }
    els.log.textContent += `\n${line}`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  let toastTimer;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  function setSessionUi(kind, title, detail) {
    els.sessionDot.className = `status-dot ${kind}`;
    els.sessionState.textContent = title;
    els.sessionDetail.textContent = detail || "";
    els.peerStateBadge.textContent = title.toUpperCase().slice(0, 14);
  }

  function requireIdentity() {
    if (!state.identity) throw new Error("Register this browser first.");
    return state.identity;
  }

  function authHeaders(extra = {}) {
    const i = requireIdentity();
    return {
      "content-type": "application/json",
      "accept": "application/json",
      "x-device-id": i.deviceId,
      "x-device-secret": i.deviceSecret,
      ...extra,
    };
  }

  async function api(path, { method = "POST", body, auth = true } = {}) {
    const headers = auth ? authHeaders() : {
      "content-type": "application/json",
      "accept": "application/json",
    };
    const response = await fetch(apiBase() + path, {
      method,
      headers,
      cache: "no-store",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { error: text }; }
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  async function checkCloud() {
    try {
      const response = await fetch(apiBase() + "/health", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("Health check failed");
      els.cloudBadge.className = "badge ok";
      els.cloudBadge.innerHTML = '<span class="dot"></span> Cloud online';
    } catch (e) {
      els.cloudBadge.className = "badge bad";
      els.cloudBadge.innerHTML = '<span class="dot"></span> Cloud offline';
      log("Cloud health failed:", e.message);
    }
  }

  function renderIdentity() {
    const i = state.identity;
    if (!i) {
      els.identityStatus.textContent = "Not registered";
      els.identityId.textContent = "—";
      els.registerBtn.textContent = "Register this browser";
      return;
    }
    els.identityStatus.textContent = i.displayName;
    els.identityId.textContent = i.deviceId;
    els.registerBtn.textContent = "Registered";
  }

  async function register() {
    if (state.identity) {
      toast("This browser is already registered.");
      return;
    }
    const name = (els.deviceName.value || "Web browser").trim().slice(0, 80);
    const data = await api("/api/devices/register", {
      auth: false,
      body: { display_name: name },
    });
    saveIdentity({
      deviceId: data.device_id,
      deviceSecret: data.device_secret,
      displayName: data.display_name,
    });
    localStorage.setItem(NAME_KEY, name);
    log("Browser registered", { deviceId: data.device_id });
    toast("Browser registered");
    await refreshPairs();
  }

  async function resetIdentity() {
    await controller.stop();
    if (!confirm("Reset this browser identity? You will need to pair it again.")) return;
    saveIdentity(null);
    state.pairs = [];
    renderPairs();
    els.pendingList.textContent = "No pending requests";
    els.pairCode.textContent = "------";
    log("Local browser identity reset.");
  }

  async function createPairCode() {
    const data = await api("/api/pair/create", { body: {} });
    els.pairCode.textContent = data.code;
    log("Pair code created");
    toast(`Pair code: ${data.code} — reusable for multiple endpoints until it expires`);
  }

  async function joinPair() {
    const code = els.joinCode.value.trim();
    if (!/^\d{6}$/.test(code)) throw new Error("Enter a valid 6-digit pair code.");
    const data = await api("/api/pair/join", { body: { code } });
    if (data.status === "already_paired") {
      toast("Already paired");
      await refreshPairs();
    } else {
      toast("Pair request sent. Approve it on the other device.");
    }
    log("Pair join request", { status: data.status });
  }

  async function refreshPending() {
    const data = await api("/api/pair/pending", { method: "GET" });
    state.pending = data.items || [];
    if (!state.pending.length) {
      els.pendingList.textContent = "No pending requests";
      return;
    }
    els.pendingList.innerHTML = "";
    for (const item of state.pending) {
      const row = document.createElement("div");
      row.className = "pending-item";
      const text = document.createElement("div");
      text.innerHTML = `<strong>${escapeHtml(item.joining_display_name || "Device")}</strong><br><small>${escapeHtml(item.joining_device_id || "")}</small>`;
      const btn = document.createElement("button");
      btn.className = "secondary small";
      btn.textContent = "Approve";
      btn.addEventListener("click", async () => {
        try {
          await api("/api/pair/approve", { body: { request_id: item.request_id } });
          toast("Device paired");
          await refreshPending();
          await refreshPairs();
        } catch (e) { handleError(e); }
      });
      row.append(text, btn);
      els.pendingList.append(row);
    }
  }

  async function refreshPairs() {
    if (!state.identity) {
      state.pairs = [];
      renderPairs();
      return;
    }
    const data = await api("/api/pairs", { method: "GET" });
    state.pairs = data.items || [];
    renderPairs();
    log(`Paired devices refreshed: ${state.pairs.length}`);
  }

  function renderPairs() {
    const old = els.pairSelect.value;
    els.pairSelect.innerHTML = "";
    if (!state.pairs.length) {
      els.pairSelect.add(new Option("No paired devices", ""));
      return;
    }
    for (const pair of state.pairs) {
      const option = new Option(pair.peer_display_name || "Paired device", pair.pair_id);
      option.dataset.peerId = pair.peer_device_id;
      els.pairSelect.add(option);
    }
    if ([...els.pairSelect.options].some(o => o.value === old)) els.pairSelect.value = old;
  }

  function selectedPair() {
    const id = els.pairSelect.value;
    const p = state.pairs.find(x => x.pair_id === id);
    if (!p) throw new Error("Select a paired device first.");
    return p;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  class WebRtcSessionController {
    constructor() {
      this.pc = null;
      this.localStream = null;
      this.sessionId = null;
      this.pollTimer = null;
      this.pendingTimer = null;
      this.lastCandidateId = 0;
      this.mode = null;
      this.pair = null;
      this.micEnabled = false;
      this.restartTimer = null;
      this.disconnectTimer = null;
      this.connectWatchdog = null;
      this.previousSessionId = null;
      this.runToken = 0;
      this.stopping = false;
    }

    async start(mode) {
      requireIdentity();
      const pair = selectedPair();
      await this.stop(false);

      this.mode = mode;
      this.pair = pair;
      this.stopping = false;
      const token = ++this.runToken;
      state.token = token;
      state.session = { mode, pairId: pair.pair_id };
      this.setButtons(true);
      setSessionUi("waiting", mode === "listen" ? "Waiting" : "Connecting",
        mode === "listen" ? `Waiting for ${pair.peer_display_name}` : `Connecting to ${pair.peer_display_name}`);
      log(`Starting ${mode}`, pair);

      try {
        await this.connectOnce(token);
      } catch (e) {
        if (token !== this.runToken || this.stopping) return;
        setSessionUi("error", "Connection error", e.message);
        log("Session error:", e.message);
        this.scheduleReconnect(token);
      }
    }

    async connectOnce(token) {
      const identity = requireIdentity();
      const pair = this.pair;
      const mode = this.mode;

      const iceData = await api("/api/ice-servers", { body: {} });
      if (token !== this.runToken) return;
      const iceServers = (iceData.iceServers || []).map(s => ({
        urls: s.urls,
        username: s.username || undefined,
        credential: s.credential || undefined,
      }));
      log("ICE servers loaded", { count: iceServers.length, turn: !!iceData.turn_enabled });

      this.pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 2,
      });

      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = setTimeout(() => {
        if (
          token === this.runToken &&
          !this.stopping &&
          this.pc &&
          this.pc.connectionState !== "connected"
        ) {
          log("Connection watchdog triggered");
          setSessionUi("waiting", "Reconnecting", "Connection negotiation timed out");
          this.scheduleReconnect(token, 0);
        }
      }, 18000);

      this.pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        els.remoteAudio.srcObject = stream;
        els.remoteAudio.play().catch(() => {
          toast("Tap 'Enable remote audio' if sound is blocked.");
        });
        log("Remote audio track received");
      };

      this.pc.onicecandidate = (event) => {
        if (!event.candidate || !this.sessionId || token !== this.runToken) return;
        api(`/api/sessions/${encodeURIComponent(this.sessionId)}/candidates`, {
          body: {
            sdp_mid: event.candidate.sdpMid,
            sdp_mline_index: event.candidate.sdpMLineIndex ?? 0,
            candidate: event.candidate.candidate,
          }
        }).catch(e => log("ICE candidate upload failed:", e.message));
      };

      this.pc.onconnectionstatechange = () => {
        if (!this.pc || token !== this.runToken) return;
        const s = this.pc.connectionState;
        log(`Peer state: ${s}`);
        if (s === "connected") {
          clearTimeout(this.disconnectTimer);
          clearTimeout(this.connectWatchdog);
          this.connectWatchdog = null;
          setSessionUi("connected", "Connected", this.sessionLabel());
          els.peerStateBadge.textContent = "CONNECTED";
        } else if (s === "connecting" || s === "new") {
          setSessionUi("waiting", "Connecting", this.sessionLabel());
        } else if (s === "disconnected") {
          setSessionUi("waiting", "Reconnecting", "Network interruption detected");
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = setTimeout(() => {
            if (this.pc?.connectionState === "disconnected") this.scheduleReconnect(token);
          }, 8000);
        } else if (s === "failed") {
          setSessionUi("error", "Reconnecting", "WebRTC connection failed");
          this.scheduleReconnect(token);
        } else if (s === "closed" && !this.stopping) {
          this.scheduleReconnect(token);
        }
      };

      const wantsMic = mode !== "listen";
      if (wantsMic) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (token !== this.runToken) return;
        for (const track of this.localStream.getAudioTracks()) {
          this.pc.addTrack(track, this.localStream);
        }
        this.micEnabled = true;
      } else {
        this.micEnabled = false;
      }
      this.renderMic();

      const initiator = mode === "transmit" ||
        (mode === "talk" && identity.deviceId < pair.peer_device_id);
      const signalingMode = mode === "talk" ? "talk" : "loop";

      let session;
      if (initiator) {
        session = await api("/api/sessions/start", {
          body: { pair_id: pair.pair_id, mode: signalingMode }
        });
      } else {
        session = await this.waitForPendingSession(
          pair.pair_id,
          signalingMode,
          token,
          this.previousSessionId
        );
      }
      if (token !== this.runToken) return;
      this.sessionId = session.session_id;
      this.lastCandidateId = 0;
      this.startCandidatePolling(token);

      if (initiator) {
        const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
        await this.pc.setLocalDescription(offer);
        await api(`/api/sessions/${encodeURIComponent(this.sessionId)}/offer`, {
          body: { sdp: this.pc.localDescription.sdp }
        });
        const answerSdp = await this.waitForAnswer(this.sessionId, token);
        if (token !== this.runToken) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      } else {
        const offerSdp = await this.waitForOffer(this.sessionId, token);
        if (token !== this.runToken) return;
        await this.pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await api(`/api/sessions/${encodeURIComponent(this.sessionId)}/answer`, {
          body: { sdp: this.pc.localDescription.sdp }
        });
      }
    }

    sessionLabel() {
      const peer = this.pair?.peer_display_name || "paired device";
      if (this.mode === "listen") return `Loop listening • ${peer}`;
      if (this.mode === "transmit") return `Loop transmitting • ${peer}`;
      return `Talk • ${peer}`;
    }

    async waitForPendingSession(pairId, wantedMode, token, ignoreSessionId = null) {
      while (token === this.runToken && !this.stopping) {
        if (!navigator.onLine) {
          setSessionUi("waiting", "Offline", "Waiting for internet connection");
          await sleep(1200);
          continue;
        }

        const data = await api(`/api/sessions/pending?pair_id=${encodeURIComponent(pairId)}`, {
          method: "GET"
        });
        const s = data.session;

        // After a network handover, the old signaling row can briefly remain
        // active while the peer rebuilds. Never attach a fresh PeerConnection
        // to that stale SDP/session.
        if (
          s &&
          s.status === "active" &&
          s.mode === wantedMode &&
          s.session_id !== ignoreSessionId
        ) {
          return s;
        }

        await sleep(1200);
      }
      throw new Error("Session stopped");
    }

    async waitForOffer(sessionId, token) {
      while (token === this.runToken && !this.stopping) {
        const s = await api(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
        if (s.offer_sdp) return s.offer_sdp;
        if (s.status !== "active") throw new Error("Session closed before offer");
        await sleep(700);
      }
      throw new Error("Session stopped");
    }

    async waitForAnswer(sessionId, token) {
      while (token === this.runToken && !this.stopping) {
        const s = await api(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "GET" });
        if (s.answer_sdp) return s.answer_sdp;
        if (s.status !== "active") throw new Error("Session closed before answer");
        await sleep(700);
      }
      throw new Error("Session stopped");
    }

    startCandidatePolling(token) {
      const poll = async () => {
        if (token !== this.runToken || !this.sessionId || !this.pc || this.stopping) return;
        try {
          const data = await api(
            `/api/sessions/${encodeURIComponent(this.sessionId)}/candidates?after=${this.lastCandidateId}`,
            { method: "GET" }
          );
          for (const item of (data.items || [])) {
            try {
              await this.pc.addIceCandidate({
                candidate: item.candidate,
                sdpMid: item.sdp_mid,
                sdpMLineIndex: item.sdp_mline_index,
              });
              this.lastCandidateId = Math.max(this.lastCandidateId, Number(item.id) || 0);
            } catch (e) {
              log("Remote ICE candidate rejected:", e.message);
            }
          }
        } catch (e) {
          log("ICE polling error:", e.message);
        }
        const delay = this.pc?.connectionState === "connected" ? 4500 : 650;
        this.pollTimer = setTimeout(poll, delay);
      };
      poll();
    }

    scheduleReconnect(token, delayMs = 1500) {
      if (this.stopping || token !== this.runToken || this.restartTimer) return;
      clearTimeout(this.disconnectTimer);

      if (!navigator.onLine) {
        setSessionUi("waiting", "Offline", "Waiting for internet connection");
        return;
      }

      this.restartTimer = setTimeout(async () => {
        this.restartTimer = null;
        if (this.stopping || token !== this.runToken) return;

        if (!navigator.onLine) {
          setSessionUi("waiting", "Offline", "Waiting for internet connection");
          return;
        }

        log("Attempting automatic reconnect");
        setSessionUi("waiting", "Reconnecting", "Building a fresh WebRTC session");

        const mode = this.mode;
        const pair = this.pair;
        await this.cleanupPeer(true);
        this.mode = mode;
        this.pair = pair;

        try {
          await this.connectOnce(token);
        } catch (e) {
          if (!this.stopping && token === this.runToken) {
            log("Reconnect failed:", e.message);
            this.scheduleReconnect(token, 2500);
          }
        }
      }, delayMs);
    }

    handleNetworkOffline() {
      if (!state.session || this.stopping) return;
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
      setSessionUi("waiting", "Offline", "Internet connection lost");
      log("Network offline");
    }

    handleNetworkOnline() {
      if (!state.session || this.stopping) return;
      log("Network online / path changed");
      setSessionUi("waiting", "Reconnecting", "Internet restored");
      this.scheduleReconnect(this.runToken, 0);
    }

    async cleanupPeer(closeRemoteSession) {
      clearTimeout(this.pollTimer);
      clearTimeout(this.pendingTimer);
      clearTimeout(this.disconnectTimer);
      clearTimeout(this.connectWatchdog);
      this.pollTimer = null;
      this.pendingTimer = null;
      this.disconnectTimer = null;
      this.connectWatchdog = null;

      const id = this.sessionId;
      this.sessionId = null;

      if (id) {
        this.previousSessionId = id;
      }

      // Await the close before looking for a replacement session. Without
      // this, a fast reconnect can immediately pick up the same stale active
      // session and reuse an obsolete SDP after Wi-Fi/mobile handover.
      if (closeRemoteSession && id && state.identity && navigator.onLine) {
        try {
          await api(`/api/sessions/${encodeURIComponent(id)}/close`, { body: {} });
          log("Previous signaling session closed", id);
        } catch (e) {
          log("Previous session close failed:", e.message);
        }
      }

      if (this.pc) {
        try { this.pc.onconnectionstatechange = null; this.pc.onicecandidate = null; this.pc.ontrack = null; } catch {}
        try { this.pc.close(); } catch {}
        this.pc = null;
      }
      if (this.localStream) {
        for (const track of this.localStream.getTracks()) track.stop();
        this.localStream = null;
      }
      els.remoteAudio.srcObject = null;
      this.micEnabled = false;
      this.renderMic();
    }

    async stop(updateUi = true) {
      this.stopping = true;
      ++this.runToken;
      state.token = this.runToken;
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
      await this.cleanupPeer(true);
      this.mode = null;
      this.pair = null;
      state.session = null;
      this.setButtons(false);
      if (updateUi) setSessionUi("idle", "Idle", "No active audio session");
      els.peerStateBadge.textContent = "IDLE";
      this.stopping = false;
      log("Audio session stopped");
    }

    toggleMute() {
      if (!this.localStream) return;
      const tracks = this.localStream.getAudioTracks();
      const nextEnabled = !tracks.some(t => t.enabled);
      tracks.forEach(t => t.enabled = nextEnabled);
      this.micEnabled = nextEnabled;
      this.renderMic();
    }

    renderMic() {
      const hasMic = !!this.localStream;
      els.muteBtn.disabled = !hasMic;
      if (!hasMic) {
        els.muteBtn.textContent = "Muted / Off";
        els.muteBtn.classList.remove("on");
      } else if (this.micEnabled) {
        els.muteBtn.textContent = "Microphone On";
        els.muteBtn.classList.add("on");
      } else {
        els.muteBtn.textContent = "Microphone Muted";
        els.muteBtn.classList.remove("on");
      }
    }

    setButtons(active) {
      els.stopBtn.disabled = !active;
      els.listenBtn.disabled = active;
      els.transmitBtn.disabled = active;
      els.talkBtn.disabled = active;
    }
  }

  const controller = new WebRtcSessionController();

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function enumerateOutputs() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === "audiooutput");
      els.outputSelect.innerHTML = '<option value="">Browser / system default</option>';
      for (const d of outputs) {
        els.outputSelect.add(new Option(d.label || `Audio output ${els.outputSelect.length}`, d.deviceId));
      }
      if (!("setSinkId" in HTMLMediaElement.prototype)) {
        els.outputSelect.disabled = true;
        els.outputSelect.title = "This browser does not support selecting an audio output.";
      }
    } catch (e) {
      log("Audio output enumeration failed:", e.message);
    }
  }

  async function applyOutput() {
    if (!("setSinkId" in els.remoteAudio)) {
      toast("This browser controls audio output through the operating system.");
      return;
    }
    try {
      await els.remoteAudio.setSinkId(els.outputSelect.value);
      toast("Audio output changed");
    } catch (e) {
      handleError(e);
    }
  }

  async function enableAudio() {
    try {
      await els.remoteAudio.play();
      toast("Remote audio enabled");
    } catch (e) { handleError(e); }
  }

  function handleError(error) {
    console.error(error);
    const message = error?.message || String(error);
    log("ERROR:", message);
    toast(message);
  }

  async function guarded(fn) {
    try { await fn(); }
    catch (e) { handleError(e); }
  }

  els.registerBtn.addEventListener("click", () => guarded(register));
  els.resetIdentityBtn.addEventListener("click", () => guarded(resetIdentity));
  els.createCodeBtn.addEventListener("click", () => guarded(createPairCode));
  els.joinBtn.addEventListener("click", () => guarded(joinPair));
  els.refreshPendingBtn.addEventListener("click", () => guarded(refreshPending));
  els.refreshPairsBtn.addEventListener("click", () => guarded(refreshPairs));
  els.listenBtn.addEventListener("click", () => guarded(() => controller.start("listen")));
  els.transmitBtn.addEventListener("click", () => guarded(() => controller.start("transmit")));
  els.talkBtn.addEventListener("click", () => guarded(() => controller.start("talk")));
  els.stopBtn.addEventListener("click", () => guarded(() => controller.stop()));
  els.muteBtn.addEventListener("click", () => controller.toggleMute());
  els.enableAudioBtn.addEventListener("click", () => guarded(enableAudio));
  els.outputSelect.addEventListener("change", () => guarded(applyOutput));
  els.volumeSlider.addEventListener("input", () => {
    els.remoteAudio.volume = Number(els.volumeSlider.value);
  });
  els.clearLogBtn.addEventListener("click", () => { els.log.textContent = "Log cleared."; });
  els.saveApiBtn.addEventListener("click", () => {
    const value = els.apiUrl.value.trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(value) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(value)) {
      return handleError(new Error("Use an HTTPS Worker URL."));
    }
    localStorage.setItem(API_KEY, value);
    toast("Endpoint saved");
    checkCloud();
  });
  els.deviceName.addEventListener("change", () => localStorage.setItem(NAME_KEY, els.deviceName.value));

  window.addEventListener("beforeunload", () => {
    if (state.session) {
      // Browser unload cannot reliably await network cleanup.
      try {
        controller.localStream?.getTracks().forEach(t => t.stop());
        controller.pc?.close();
      } catch {}
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.session) {
      log("Page moved to background. Mobile browsers may suspend audio/signaling.");
    }
  });

  window.addEventListener("offline", () => controller.handleNetworkOffline());
  window.addEventListener("online", () => controller.handleNetworkOnline());

  // Chrome/Edge expose network-path changes on many devices. This catches
  // Wi-Fi -> mobile/hotspot changes that may not generate a full offline event.
  if (navigator.connection?.addEventListener) {
    navigator.connection.addEventListener("change", () => {
      if (!state.session || controller.stopping) return;
      if (controller.pc?.connectionState === "connected") {
        log("Network path changed; waiting briefly for ICE to recover");
        setTimeout(() => {
          if (
            state.session &&
            controller.pc &&
            controller.pc.connectionState !== "connected"
          ) {
            controller.handleNetworkOnline();
          }
        }, 1200);
      } else {
        controller.handleNetworkOnline();
      }
    });
  }

  async function init() {
    els.apiUrl.value = apiBase();
    els.deviceName.value = localStorage.getItem(NAME_KEY) ||
      `Web ${navigator.platform || "Browser"}`.slice(0, 80);
    renderIdentity();
    controller.setButtons(false);
    await checkCloud();
    await enumerateOutputs();
    if (state.identity) {
      await guarded(refreshPairs);
      await guarded(refreshPending);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(e => log("Service worker:", e.message));
    }
  }

  init();
})();
