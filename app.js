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
    connectPin: $("connectPin"),
    connectBtn: $("connectBtn"),
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


  async function connectByPin() {
    if (!state.identity) await register();
    const pin = els.connectPin.value.trim();
    if (!/^\d{6}$/.test(pin)) throw new Error("Enter the Android device's 6-digit permanent PIN.");

    setSessionUi("waiting", "Pairing", "Connecting to Android device PIN…");
    const data = await api("/api/pair/pin", { body: { pin } });
    await refreshPairs();

    const option = [...els.pairSelect.options].find(o => o.value === data.pair_id);
    if (!option) throw new Error("Pair was created but could not be selected. Press Refresh and try again.");
    els.pairSelect.value = data.pair_id;

    toast(`Paired with ${data.peer_display_name || "Android device"}`);
    log("Permanent PIN pair ready", { pairId: data.pair_id, status: data.status });
    await controller.start("listen");
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

  class SignalChannel {
    constructor(pairId) {
      this.pairId = pairId;
      this.ws = null;
      this.queue = [];
      this.waiters = [];
      this.failed = null;
      this.onControl = null;
      this.closedByUs = false;
      this.superseded = false;
    }

    static async connect(pairId) {
      const ticketData = await api("/api/signal-ticket", { body: { pair_id: pairId } });
      const base = apiBase();
      const wsBase = base.startsWith("https://") ? `wss://${base.slice(8)}` : `ws://${base.slice(7)}`;
      const channel = new SignalChannel(pairId);
      await channel.open(`${wsBase}/api/signal?ticket=${encodeURIComponent(ticketData.ticket)}`);
      return channel;
    }

    open(url) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        this.ws = ws;
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { ws.close(); } catch {}
            reject(new Error("WebSocket connection timed out"));
          }
        }, 15000);
        ws.onopen = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        ws.onmessage = (event) => {
          try { this.dispatch(JSON.parse(event.data)); } catch {}
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error("WebSocket connection failed"));
          }
        };
        ws.onclose = (event) => {
          if (this.closedByUs) return;
          const code = event.code || 1006;
          const isSuperseded = code === 4001 || this.superseded;
          const error = new Error(`Signaling socket closed (${code})`);
          error.code = code;
          error.superseded = isSuperseded;
          this.fail(error);
          if (this.onControl) {
            this.onControl({
              type: isSuperseded ? "socket-superseded" : "socket-closed",
              code,
              reason: error.message,
            });
          }
        };
      });
    }

    dispatch(message) {
      if (message.type === "superseded") this.superseded = true;
      if (["peer-offline", "peer-online", "close", "socket-closed", "superseded"].includes(message.type) && this.onControl) {
        this.onControl(message);
      }
      for (let i = 0; i < this.waiters.length; i++) {
        const waiter = this.waiters[i];
        if (waiter.predicate(message)) {
          this.waiters.splice(i, 1);
          waiter.resolve(message);
          return;
        }
      }
      this.queue.push(message);
      if (this.queue.length > 200) this.queue.shift();
    }

    waitFor(predicate) {
      if (this.failed) return Promise.reject(this.failed);
      const index = this.queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(this.queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => this.waiters.push({ predicate, resolve, reject }));
    }

    fail(error) {
      if (this.failed) return;
      this.failed = error;
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    }

    send(message) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
      this.ws.send(JSON.stringify(message));
      return true;
    }

    close(sessionId = null) {
      this.closedByUs = true;
      if (sessionId) this.send({ type: "close", session_id: sessionId });
      try { this.ws?.close(1000, "LoopLink session closed"); } catch {}
      this.ws = null;
    }
  }

  class WebRtcSessionController {
    constructor() {
      this.pc = null;
      this.signal = null;
      this.localStream = null;
      this.mode = null;
      this.pair = null;
      this.sessionId = null;
      this.previousSessionId = null;
      this.pendingRemoteCandidates = [];
      this.restartTimer = null;
      this.disconnectTimer = null;
      this.connectWatchdog = null;
      this.peerOfflineTimer = null;
      this.runToken = 0;
      this.stopping = false;
      this.reconnectBackoffMs = 1500;
      this.attemptSerial = 0;
      this.activeAttempt = 0;
      this.micEnabled = false;
    }

    async start(mode) {
      requireIdentity();
      const pair = selectedPair();
      await this.stop(false);
      this.mode = mode;
      this.pair = pair;
      this.stopping = false;
      const token = ++this.runToken;
      const attempt = ++this.attemptSerial;
      this.activeAttempt = attempt;
      state.token = token;
      state.session = { mode, pairId: pair.pair_id };
      this.setButtons(true);
      setSessionUi("waiting", mode === "listen" ? "Waiting" : "Connecting",
        mode === "listen" ? `Waiting for ${pair.peer_display_name}` : `Connecting to ${pair.peer_display_name}`);
      log(`Starting ${mode} with WebSocket signaling`, pair);
      try {
        await this.connectOnce(token, attempt);
      } catch (e) {
        if (token !== this.runToken || attempt !== this.activeAttempt || this.stopping) return;
        setSessionUi("error", "Connection error", e.message);
        log("Session error:", e.message);
        this.scheduleReconnect(token, attempt);
      }
    }

    async connectOnce(token, attempt) {
      const identity = requireIdentity();
      const pair = this.pair;
      const mode = this.mode;
      const initiator = mode === "transmit" ||
        (mode === "talk" && identity.deviceId < pair.peer_device_id);
      const signalingMode = mode === "talk" ? "talk" : "loop";

      const signal = await SignalChannel.connect(pair.pair_id);
      if (token !== this.runToken || attempt !== this.activeAttempt || this.stopping) {
        signal.close();
        return;
      }
      this.signal = signal;
      signal.onControl = (message) => {
        if (this.stopping || token !== this.runToken || attempt !== this.activeAttempt) return;
        if (message.type === "close" && message.session_id && message.session_id !== this.sessionId) return;
        log("Signaling control:", message.type);

        if (message.type === "peer-offline") {
          // Presence is advisory. Keep our signaling socket alive and let the peer
          // reconnect into the same room. Closing/reopening here created a mutual
          // reconnect cascade in v0.4.0/v0.4.1. WebRTC state/watchdog decides when
          // an actual media negotiation must be restarted.
          if (!this.pc || this.pc.connectionState !== "connected") {
            setSessionUi("waiting", "Waiting", "Paired device is temporarily offline");
          }
          return;
        }
        if (message.type === "peer-online") {
          clearTimeout(this.peerOfflineTimer);
          this.peerOfflineTimer = null;
          return;
        }

        if (message.type === "superseded" || message.type === "socket-superseded") {
          // Most commonly another tab of the same browser/device became active.
          // The old tab must relinquish instead of reconnecting and fighting the
          // new tab forever.
          this.relinquishSuperseded();
          return;
        }

        // A real local signaling failure or a close of the current session needs
        // a reconnect. Use backoff rather than an immediate retry storm.
        this.scheduleReconnect(token, attempt);
      };
      log("WebSocket signaling connected");

      if (initiator) {
        this.sessionId = crypto.randomUUID();
        signal.send({ type: "start", session_id: this.sessionId, mode: signalingMode });
        await signal.waitFor(m => m.type === "session-ready" && m.session_id === this.sessionId);
      } else {
        signal.send({
          type: "ready",
          mode: signalingMode,
          ignore_session_id: this.previousSessionId || undefined,
        });
        const start = await signal.waitFor(m =>
          m.type === "session-start" &&
          m.mode === signalingMode &&
          m.session_id !== this.previousSessionId
        );
        this.sessionId = start.session_id;
        signal.send({ type: "session-ready", session_id: this.sessionId });
      }
      if (token !== this.runToken || attempt !== this.activeAttempt) return;

      // TURN credentials are fetched only once a peer is actually ready.
      const iceData = await api("/api/ice-servers", { body: {} });
      if (token !== this.runToken || attempt !== this.activeAttempt) return;
      const iceServers = (iceData.iceServers || []).map(s => ({
        urls: s.urls,
        username: s.username || undefined,
        credential: s.credential || undefined,
      }));
      log("ICE servers loaded", { count: iceServers.length, turn: !!iceData.turn_enabled });

      this.pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
      this.pendingRemoteCandidates = [];

      this.pc.ontrack = (event) => {
        const stream = event.streams?.[0] || new MediaStream([event.track]);
        els.remoteAudio.srcObject = stream;
        els.remoteAudio.play().catch(() => toast("Tap 'Enable remote audio' if sound is blocked."));
        log("Remote audio track received");
      };

      this.pc.onicecandidate = (event) => {
        if (!event.candidate || !this.sessionId || token !== this.runToken) return;
        this.signal?.send({
          type: "candidate",
          session_id: this.sessionId,
          sdp_mid: event.candidate.sdpMid,
          sdp_mline_index: event.candidate.sdpMLineIndex ?? 0,
          candidate: event.candidate.candidate,
        });
      };

      this.signalCandidateLoop(token, attempt, signal, this.sessionId).catch(e => {
        if (!this.stopping && token === this.runToken && attempt === this.activeAttempt) log("Signal candidate loop:", e.message);
      });

      this.pc.onconnectionstatechange = () => {
        if (!this.pc || token !== this.runToken) return;
        const s = this.pc.connectionState;
        log(`Peer state: ${s}`);
        if (s === "connected") {
          this.reconnectBackoffMs = 1500;
          clearTimeout(this.peerOfflineTimer);
          this.peerOfflineTimer = null;
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
            if (this.pc?.connectionState === "disconnected") this.scheduleReconnect(token, attempt);
          }, 8000);
        } else if (s === "failed" || (s === "closed" && !this.stopping)) {
          this.scheduleReconnect(token, attempt);
        }
      };

      const wantsMic = mode !== "listen";
      if (wantsMic) {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (token !== this.runToken || attempt !== this.activeAttempt) return;
        for (const track of this.localStream.getAudioTracks()) this.pc.addTrack(track, this.localStream);
        this.micEnabled = true;
      } else {
        this.micEnabled = false;
      }
      this.renderMic();

      clearTimeout(this.connectWatchdog);
      this.connectWatchdog = setTimeout(() => {
        if (token === this.runToken && !this.stopping && this.pc?.connectionState !== "connected") {
          log("Connection watchdog triggered");
          this.scheduleReconnect(token, attempt, 0);
        }
      }, 18000);

      if (initiator) {
        const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
        await this.pc.setLocalDescription(offer);
        signal.send({ type: "offer", session_id: this.sessionId, sdp: this.pc.localDescription.sdp });
        const answer = await signal.waitFor(m => m.type === "answer" && m.session_id === this.sessionId);
        if (token !== this.runToken || attempt !== this.activeAttempt) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        await this.flushRemoteCandidates();
      } else {
        const offer = await signal.waitFor(m => m.type === "offer" && m.session_id === this.sessionId);
        if (token !== this.runToken || attempt !== this.activeAttempt) return;
        await this.pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
        await this.flushRemoteCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        signal.send({ type: "answer", session_id: this.sessionId, sdp: this.pc.localDescription.sdp });
      }
    }

    async signalCandidateLoop(token, attempt, signal, sessionId) {
      while (token === this.runToken && attempt === this.activeAttempt && !this.stopping) {
        const message = await signal.waitFor(m => m.type === "candidate" && m.session_id === sessionId);
        const candidate = {
          candidate: message.candidate,
          sdpMid: message.sdp_mid,
          sdpMLineIndex: message.sdp_mline_index,
        };
        if (this.pc?.remoteDescription) {
          try { await this.pc.addIceCandidate(candidate); }
          catch (e) { log("Remote ICE candidate rejected:", e.message); }
        } else {
          this.pendingRemoteCandidates.push(candidate);
        }
      }
    }

    async flushRemoteCandidates() {
      for (const candidate of this.pendingRemoteCandidates.splice(0)) {
        try { await this.pc.addIceCandidate(candidate); }
        catch (e) { log("Buffered ICE candidate rejected:", e.message); }
      }
    }

    sessionLabel() {
      const peer = this.pair?.peer_display_name || "paired device";
      if (this.mode === "listen") return `Loop listening • ${peer}`;
      if (this.mode === "transmit") return `Loop transmitting • ${peer}`;
      return `Talk • ${peer}`;
    }

    scheduleReconnect(token, attempt, delayMs = null) {
      if (this.stopping || token !== this.runToken || attempt !== this.activeAttempt || this.restartTimer) return;
      clearTimeout(this.disconnectTimer);
      if (!navigator.onLine) {
        setSessionUi("waiting", "Offline", "Waiting for internet connection");
        return;
      }
      const delay = delayMs == null ? this.reconnectBackoffMs : delayMs;
      if (delayMs == null) this.reconnectBackoffMs = Math.min(Math.round(this.reconnectBackoffMs * 1.8), 30000);
      this.restartTimer = setTimeout(async () => {
        this.restartTimer = null;
        if (this.stopping || token !== this.runToken || attempt !== this.activeAttempt) return;
        const mode = this.mode;
        const pair = this.pair;

        // Invalidate the previous async connectOnce before touching shared state.
        // Automatic recovery closes only our local socket; it does NOT send a
        // remote session-close, which previously made both endpoints restart each other.
        const nextAttempt = ++this.attemptSerial;
        this.activeAttempt = nextAttempt;
        await this.cleanupPeer(false);
        this.mode = mode;
        this.pair = pair;
        try {
          await this.connectOnce(token, nextAttempt);
        } catch (e) {
          if (!this.stopping && token === this.runToken && nextAttempt === this.activeAttempt) {
            log("Reconnect failed:", e.message);
            this.scheduleReconnect(token, nextAttempt);
          }
        }
      }, delay);
    }

    async relinquishSuperseded() {
      if (this.stopping) return;
      this.stopping = true;
      ++this.runToken;
      this.activeAttempt = ++this.attemptSerial;
      state.token = this.runToken;
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
      await this.cleanupPeer(false);
      this.mode = null;
      this.pair = null;
      state.session = null;
      this.setButtons(false);
      els.peerStateBadge.textContent = "PAUSED";
      setSessionUi("waiting", "Another tab is active", "This LoopLink tab stopped signaling to prevent duplicate reconnects.");
      this.stopping = false;
      log("Signaling relinquished because another connection for this device became active");
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
      this.reconnectBackoffMs = 1500;
      setSessionUi("waiting", "Reconnecting", "Internet restored");
      this.scheduleReconnect(this.runToken, this.activeAttempt, 0);
    }

    async cleanupPeer(closeRemoteSession) {
      clearTimeout(this.disconnectTimer);
      clearTimeout(this.connectWatchdog);
      clearTimeout(this.peerOfflineTimer);
      this.disconnectTimer = null;
      this.connectWatchdog = null;
      const id = this.sessionId;
      if (id) this.previousSessionId = id;
      if (this.signal) {
        // Manual cleanup must not be interpreted as an unexpected network close.
        this.signal.onControl = null;
        if (closeRemoteSession) this.signal.close(id);
        else this.signal.close();
        this.signal = null;
      }
      this.sessionId = null;
      if (this.pc) {
        try { this.pc.onconnectionstatechange = null; this.pc.onicecandidate = null; this.pc.ontrack = null; } catch {}
        try { this.pc.close(); } catch {}
        this.pc = null;
      }
      if (this.localStream) {
        for (const track of this.localStream.getTracks()) track.stop();
        this.localStream = null;
      }
      this.pendingRemoteCandidates = [];
      els.remoteAudio.srcObject = null;
      this.micEnabled = false;
      this.renderMic();
    }

    async stop(updateUi = true) {
      this.stopping = true;
      ++this.runToken;
      this.activeAttempt = ++this.attemptSerial;
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
  els.connectBtn.addEventListener("click", () => guarded(connectByPin));
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
  els.connectPin.addEventListener("keydown", (event) => {
    if (event.key === "Enter") guarded(connectByPin);
  });

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
    if (!state.identity) {
      await guarded(register);
    }
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
