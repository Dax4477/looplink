(() => {
  "use strict";
  const API = "https://looplink-api.obserax.workers.dev";
  const ID_KEY = "looplink.web.endpoint.id.v1";
  const SECRET_KEY = "looplink.web.endpoint.secret.v1";
  const NAME_KEY = "looplink.web.endpoint.name.v1";
  const $ = id => document.getElementById(id);

  const els = {
    status: $("statusPill"), subtitle: $("subtitle"), endpointName: $("endpointName"), endpointId: $("endpointId"),
    vibrateCap: $("vibrateCap"), socketState: $("socketState"), routeCount: $("routeCount"),
    enableVibration: $("enableVibration"), pulse: $("pulseButton"), message: $("message")
  };

  let socket = null;
  let reconnectTimer = null;
  let vibrationEnabled = false;
  let approved = false;

  function identity() {
    return { id: localStorage.getItem(ID_KEY) || "", secret: localStorage.getItem(SECRET_KEY) || "" };
  }
  function headers() {
    const i = identity();
    return { "content-type":"application/json", "accept":"application/json", "x-endpoint-id":i.id, "x-endpoint-secret":i.secret };
  }
  async function request(path, options={}) {
    const r = await fetch(API + path, { method: options.method || "GET", cache:"no-store", headers: headers(), body: options.body ? JSON.stringify(options.body) : undefined });
    const text = await r.text();
    let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = {error:text}; }
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), {status:r.status, data});
    return data;
  }
  function setStatus(state, text) {
    els.status.className = "pill " + (state || "");
    els.status.textContent = text;
  }
  function browserName() {
    const ua = navigator.userAgent || "Browser";
    let name = /SamsungBrowser/i.test(ua) ? "Samsung Internet" : /Edg/i.test(ua) ? "Edge" : /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Browser";
    return `${name} Web`;
  }
  async function ensureRegistered() {
    let i = identity();
    if (i.id && i.secret) return i;
    const name = localStorage.getItem(NAME_KEY) || browserName();
    const data = await fetch(API + "/api/endpoints/web/register", {
      method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({
        display_name:name,
        capabilities:{ vibrate:"vibrate" in navigator, audio:!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), push:"Notification" in window, platform:navigator.userAgent.slice(0,80) }
      })
    }).then(async r => { const d = await r.json(); if(!r.ok) throw new Error(d.error || `HTTP ${r.status}`); return d; });
    localStorage.setItem(ID_KEY, data.endpoint_id); localStorage.setItem(SECRET_KEY, data.endpoint_secret); localStorage.setItem(NAME_KEY, data.display_name);
    return {id:data.endpoint_id, secret:data.endpoint_secret};
  }
  async function refreshState() {
    try {
      const state = await request("/api/endpoint/state");
      els.endpointName.textContent = state.display_name || localStorage.getItem(NAME_KEY) || "Web endpoint";
      els.endpointId.textContent = state.endpoint_id;
      els.routeCount.textContent = state.outgoing_links || 0;
      approved = state.status === "approved";
      if (approved) {
        setStatus("", "Approved");
        els.subtitle.textContent = "This browser is an approved LoopLink endpoint.";
        els.pulse.disabled = false;
        connectSocket();
      } else if (state.status === "rejected") {
        setStatus("bad", "Rejected"); els.subtitle.textContent = "Admin rejected this web endpoint."; els.pulse.disabled = true; closeSocket();
      } else {
        setStatus("pending", "Pending approval"); els.subtitle.textContent = "Open Admin and approve this browser endpoint."; els.pulse.disabled = true; closeSocket();
      }
    } catch (e) {
      setStatus("bad", "Offline"); els.subtitle.textContent = e.message; els.pulse.disabled = true;
    }
  }
  function vibrate(duration=350) {
    if (!vibrationEnabled || !("vibrate" in navigator)) return false;
    try { return navigator.vibrate(Math.max(50, Math.min(1000, Number(duration)||350))); } catch { return false; }
  }
  async function connectSocket() {
    if (!approved || socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(reconnectTimer);
    try {
      const {ticket} = await request("/api/endpoint-control-ticket", {method:"POST"});
      const wsBase = API.replace(/^https:/i,"wss:").replace(/^http:/i,"ws:");
      socket = new WebSocket(`${wsBase}/api/endpoint-control?ticket=${encodeURIComponent(ticket)}`);
      els.socketState.textContent = "Connecting";
      socket.onopen = () => { els.socketState.textContent = "Connected"; };
      socket.onmessage = ev => {
        let data; try { data = JSON.parse(ev.data); } catch { return; }
        if (data.type === "pulse") {
          vibrate(data.duration_ms);
          els.message.textContent = `Incoming Pulse • ${new Date().toLocaleTimeString()}`;
          els.pulse.animate([{transform:"scale(1)"},{transform:"scale(1.06)"},{transform:"scale(1)"}],{duration:280});
        }
      };
      socket.onclose = () => { els.socketState.textContent = "Disconnected"; socket = null; reconnectTimer = setTimeout(connectSocket, 3000); };
      socket.onerror = () => { els.socketState.textContent = "Error"; };
    } catch (e) { els.socketState.textContent = "Unavailable"; reconnectTimer = setTimeout(connectSocket, 5000); }
  }
  function closeSocket(){ clearTimeout(reconnectTimer); try{socket?.close(1000,"endpoint not approved");}catch{} socket=null; els.socketState.textContent="Disconnected"; }

  els.enableVibration.addEventListener("click", () => {
    vibrationEnabled = "vibrate" in navigator;
    if (vibrationEnabled) navigator.vibrate(20);
    els.vibrateCap.textContent = vibrationEnabled ? "Enabled" : "Unsupported";
    els.enableVibration.textContent = vibrationEnabled ? "Vibration enabled" : "Vibration unsupported";
  });
  els.pulse.addEventListener("click", async () => {
    if (!approved) return;
    vibrate(70);
    els.pulse.disabled = true;
    try {
      const result = await request("/api/endpoint/pulse", {method:"POST", body:{duration_ms:350,pattern:"normal"}});
      els.message.textContent = result.targets?.length ? `Pulse routed to ${result.targets.length} endpoint(s) • live deliveries: ${result.delivered}` : "No outgoing Pulse route. Add one in Admin.";
    } catch(e) { els.message.textContent = e.message; }
    finally { setTimeout(()=>{ if(approved) els.pulse.disabled=false; },350); }
  });

  els.vibrateCap.textContent = "vibrate" in navigator ? "Supported" : "Unsupported";
  ensureRegistered().then(i => { els.endpointId.textContent=i.id; return refreshState(); }).catch(e => {setStatus("bad","Registration failed"); els.subtitle.textContent=e.message;});
  setInterval(()=>{ if(!document.hidden) refreshState(); },15000);
  setInterval(()=>{ if(identity().id) request("/api/endpoint/heartbeat",{method:"POST"}).catch(()=>{}); },30000);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshState(); });
})();
