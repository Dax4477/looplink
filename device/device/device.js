(() => {
  "use strict";
  const API = "https://looplink-api.obserax.workers.dev";
  const cloud = document.getElementById("cloud");
  const state = document.getElementById("configState");
  const list = document.getElementById("configList");

  const label = key => ({
    config_version:"Config version", heartbeat_seconds:"Heartbeat", reconnect_max_seconds:"Reconnect ceiling",
    config_refresh_minutes:"Refresh interval", allow_transmit:"Transmit", allow_broadcast:"Broadcast",
    allow_listen:"Listen", allow_talk:"Talk", transmit_gain:"Transmit gain", talk_gain:"Talk gain",
    receive_gain:"Receive gain"
  })[key] || key;

  async function checkCloud() {
    try {
      const r = await fetch(`${API}/health`, {cache:"no-store"});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      cloud.textContent = `Cloud online • ${data.version || "ready"}`;
      cloud.className = "badge ok";
    } catch (e) {
      cloud.textContent = "Cloud unavailable";
      cloud.className = "badge bad";
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch("../device-config.json", {cache:"no-store"});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      state.textContent = "Configuration loaded. Native Audio Link caches the last valid copy for offline resilience.";
      const keys = ["config_version","heartbeat_seconds","reconnect_max_seconds","config_refresh_minutes","allow_transmit","allow_broadcast","allow_listen","allow_talk","transmit_gain","talk_gain","receive_gain"];
      list.innerHTML = keys.map(k => `<dt>${label(k)}</dt><dd>${String(data[k])}</dd>`).join("");
    } catch (e) {
      state.textContent = "Remote configuration could not be loaded. The native app continues with its cached/default configuration.";
    }
  }

  checkCloud();
  loadConfig();
})();
