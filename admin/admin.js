(() => {
  "use strict";

  const DEFAULT_API = "https://looplink-api.obserax.workers.dev";
  const TOKEN_KEY = "looplink.admin.token.v1";
  const API_KEY = "looplink.admin.api.v1";
  const $ = id => document.getElementById(id);

  const els = {
    apiUrl: $("apiUrl"),
    adminToken: $("adminToken"),
    connectBtn: $("connectBtn"),
    refreshBtn: $("refreshBtn"),
    cloudState: $("cloudState"),
    deviceCount: $("deviceCount"),
    onlineCount: $("onlineCount"),
    pairCount: $("pairCount"),
    deviceList: $("deviceList"),
    emptyState: $("emptyState"),
    lastRefresh: $("lastRefresh"),
    toast: $("toast"),
  };

  let timer = null;

  function apiBase() {
    return (sessionStorage.getItem(API_KEY) || els.apiUrl.value || DEFAULT_API).replace(/\/+$/, "");
  }

  function token() {
    return sessionStorage.getItem(TOKEN_KEY) || els.adminToken.value.trim();
  }

  let toastTimer;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  async function api(path, options = {}) {
    const adminToken = token();
    if (!adminToken) throw new Error("Enter the LoopLink admin token.");
    const response = await fetch(apiBase() + path, {
      method: options.method || "GET",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "authorization": `Bearer ${adminToken}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function formatAgo(epochSeconds) {
    const s = Math.max(0, Math.round(Date.now() / 1000 - Number(epochSeconds || 0)));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function modeLabel(mode) {
    return ({
      transmit: "Loop Transmit",
      broadcast: "Loop Broadcast",
      listen: "Loop Listen",
      talk: "Talk",
      stop: "Stopped",
      idle: "Idle",
    })[mode] || mode || "Unknown";
  }

  function render(data) {
    const items = data.items || [];
    els.deviceCount.textContent = items.length;
    els.onlineCount.textContent = items.filter(x => x.online).length;
    els.pairCount.textContent = items.reduce((sum, x) => sum + Number(x.pair_count || 0), 0);
    els.lastRefresh.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    els.emptyState.style.display = items.length ? "none" : "block";
    els.emptyState.textContent = items.length ? "" : "No managed Android devices yet. Open Audio Link v0.7.0 on a device to register it.";
    els.deviceList.innerHTML = "";

    for (const item of items) {
      const el = document.createElement("article");
      el.className = `device ${item.online ? "" : "offline"}`;
      el.innerHTML = `
        <div>
          <h3>${escapeHtml(item.display_name || item.device_model || "Android device")}</h3>
          <div class="meta">
            <span class="status"><i class="dot ${item.online ? "online" : ""}"></i>${item.online ? "Online" : "Offline"}</span>
            <span>${escapeHtml(item.device_model || "")}</span>
            <span>Android ${escapeHtml(item.android_version || "?")}</span>
            <span>App ${escapeHtml(item.app_version || "?")}</span>
            <span>${Number(item.pair_count || 0)} paired</span>
            <span>Seen ${formatAgo(item.last_seen)}</span>
          </div>
          <div class="idcode">${escapeHtml(item.device_id)}</div>
        </div>
        <div class="pinbox">
          <span>PERMANENT PIN</span>
          <code>${escapeHtml(item.pairing_pin)}</code>
          <div class="mode-badges">
            <span class="badge">Current: ${escapeHtml(modeLabel(item.current_mode))}</span>
            <span class="badge desired">Desired: ${escapeHtml(modeLabel(item.desired_mode))}</span>
          </div>
        </div>
        <div class="controls">
          <div class="mode-row">
            <select class="mode-select">
              <option value="transmit">Loop Transmit</option>
              <option value="broadcast">Loop Broadcast</option>
              <option value="listen">Loop Listen</option>
              <option value="talk">Talk</option>
              <option value="stop">Stop</option>
            </select>
            <button class="apply-mode primary">Apply</button>
            <button class="check-config">Refresh Config</button>
            <button class="check-update">Check Update</button>
          </div>
        </div>
      `;
      const select = el.querySelector(".mode-select");
      select.value = ["transmit","broadcast","listen","talk","stop"].includes(item.desired_mode)
        ? item.desired_mode
        : "transmit";
      el.querySelector(".apply-mode").addEventListener("click", async () => {
        try {
          const mode = select.value;
          await api(`/api/admin/devices/${encodeURIComponent(item.device_id)}/mode`, {
            method: "POST",
            body: { mode },
          });
          toast(`${item.display_name || "Device"} → ${modeLabel(mode)}`);
          await refresh();
        } catch (error) {
          showError(error);
        }
      });
      el.querySelector(".check-config").addEventListener("click", async () => {
        try {
          await api(`/api/admin/devices/${encodeURIComponent(item.device_id)}/config-refresh`, {
            method: "POST",
          });
          toast(`${item.display_name || "Device"} → runtime config refresh sent`);
        } catch (error) {
          showError(error);
        }
      });
      el.querySelector(".check-update").addEventListener("click", async () => {
        try {
          await api(`/api/admin/devices/${encodeURIComponent(item.device_id)}/update`, {
            method: "POST",
          });
          toast(`${item.display_name || "Device"} → update check sent`);
        } catch (error) {
          showError(error);
        }
      });
      els.deviceList.append(el);
    }
  }

  async function refresh() {
    const data = await api("/api/admin/devices");
    els.cloudState.className = "pill ok";
    els.cloudState.textContent = "Admin API connected";
    render(data);
  }

  async function connect() {
    const value = els.apiUrl.value.trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(value) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(value)) {
      throw new Error("Use an HTTPS Worker URL.");
    }
    const adminToken = els.adminToken.value.trim();
    if (!adminToken) throw new Error("Enter the admin token.");
    sessionStorage.setItem(API_KEY, value);
    sessionStorage.setItem(TOKEN_KEY, adminToken);
    await refresh();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) refresh().catch(showError);
    }, 15000);
  }

  function showError(error) {
    console.error(error);
    els.cloudState.className = "pill bad";
    els.cloudState.textContent = error?.message || "Admin API error";
    toast(error?.message || String(error));
  }

  els.connectBtn.addEventListener("click", () => connect().catch(showError));
  els.refreshBtn.addEventListener("click", () => refresh().catch(showError));
  els.adminToken.addEventListener("keydown", event => {
    if (event.key === "Enter") connect().catch(showError);
  });

  els.apiUrl.value = sessionStorage.getItem(API_KEY) || DEFAULT_API;
  els.adminToken.value = sessionStorage.getItem(TOKEN_KEY) || "";
  if (token()) connect().catch(showError);
})();
