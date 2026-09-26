(() => {
  "use strict";

  const DEFAULT_API="https://looplink-api.obserax.workers.dev",
        TOKEN_KEY="looplink.admin.token.v1",
        API_KEY="looplink.admin.api.v1",
        $=id=>document.getElementById(id);

  const els={
    apiUrl:$("apiUrl"),adminToken:$("adminToken"),connectBtn:$("connectBtn"),refreshBtn:$("refreshBtn"),
    cloudState:$("cloudState"),endpointCount:$("endpointCount"),onlineCount:$("onlineCount"),
    pendingCount:$("pendingCount"),linkCount:$("linkCount"),lastRefresh:$("lastRefresh"),
    endpointList:$("endpointList"),endpointEmpty:$("endpointEmpty"),source:$("sourceEndpoint"),
    target:$("targetEndpoint"),direction:$("direction"),createLinkBtn:$("createLinkBtn"),
    linkList:$("linkList"),toast:$("toast"),endpointSearch:$("endpointSearch"),
    endpointFilters:$("endpointFilters"),endpointSort:$("endpointSort"),confirmModal:$("confirmModal"),
    modalEyebrow:$("modalEyebrow"),modalTitle:$("modalTitle"),modalMessage:$("modalMessage"),
    modalIdentity:$("modalIdentity"),modalConfirmBtn:$("modalConfirmBtn"),
    deleteConfirmWrap:$("deleteConfirmWrap"),deleteConfirmInput:$("deleteConfirmInput")
  };

  let endpoints=[],links=[],devices=[],timer=null,toastTimer,activeFilter="all",modalAction=null;

  const REQUIRED_IDS = [
    "apiUrl","adminToken","connectBtn","refreshBtn","cloudState",
    "endpointCount","onlineCount","pendingCount","linkCount","lastRefresh",
    "endpointList","endpointEmpty","sourceEndpoint","targetEndpoint","direction",
    "createLinkBtn","linkList","toast","endpointSearch","endpointFilters",
    "endpointSort","confirmModal","modalEyebrow","modalTitle","modalMessage",
    "modalIdentity","modalConfirmBtn","deleteConfirmWrap","deleteConfirmInput"
  ];

  const missingIds = REQUIRED_IDS.filter(id => !document.getElementById(id));
  if (missingIds.length) {
    const message = `LoopLink Admin UI files are out of sync. Missing HTML elements: ${missingIds.join(", ")}. Deploy admin.html, admin.css and admin.js from the same release, then hard-refresh.`;
    console.error(message);
    const state = document.getElementById("cloudState");
    if (state) {
      state.className = "pill bad";
      state.textContent = "Admin UI files out of sync";
    }
    const banner = document.createElement("div");
    banner.style.cssText = "position:fixed;left:16px;right:16px;top:16px;z-index:99999;padding:14px 16px;border:1px solid #ff7474;background:#2b1114;color:#ffd8dc;border-radius:12px;font:700 14px/1.4 system-ui";
    banner.textContent = message;
    document.body.appendChild(banner);
    return;
  }


  const apiBase=()=> (sessionStorage.getItem(API_KEY)||els.apiUrl.value||DEFAULT_API).replace(/\/+$/,"");
  const token=()=>sessionStorage.getItem(TOKEN_KEY)||els.adminToken.value.trim();
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const ago=e=>{const s=Math.max(0,Math.round(Date.now()/1000-Number(e||0)));return s<60?`${s}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:`${Math.floor(s/86400)}d ago`};
  const modeLabel=m=>({transmit:"Loop Transmit",broadcast:"Loop Broadcast",listen:"Loop Listen",talk:"Talk",stop:"Stopped",idle:"Idle"})[m]||m||"Unknown";

  function toast(m){els.toast.textContent=m;els.toast.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.classList.remove("show"),2500)}

  async function api(path,o={}){
    if(!token())throw new Error("Enter the LoopLink admin token.");
    const r=await fetch(apiBase()+path,{
      method:o.method||"GET",cache:"no-store",
      headers:{"content-type":"application/json","accept":"application/json","authorization":`Bearer ${token()}`},
      body:o.body===undefined?undefined:JSON.stringify(o.body)
    });
    const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={error:t}}
    if(!r.ok){const e=new Error(d.error||`API ${r.status}`);e.status=r.status;throw e}
    return d;
  }

  function deviceForEndpoint(e){
    if(e.kind!=="android")return null;
    return devices.find(d=>d.device_id===e.endpoint_id||d.endpoint_id===e.endpoint_id)||null;
  }

  function renderSelectors(){
    const approved=endpoints.filter(e=>e.status==="approved");
    for(const el of [els.source,els.target]){
      const old=el.value;
      el.innerHTML='<option value="">Select endpoint…</option>'+approved.map(e=>`<option value="${esc(e.endpoint_id)}">${esc(`${e.display_name||e.endpoint_id} • ${e.kind}${e.online?" • online":""}`)}</option>`).join("");
      if(approved.some(e=>e.endpoint_id===old))el.value=old;
    }
  }

  function filteredEndpoints(){
    const q=els.endpointSearch.value.trim().toLowerCase();
    let items=[...endpoints];
    if(q){
      items=items.filter(e=>{
        const d=deviceForEndpoint(e);
        return [e.display_name,e.endpoint_id,e.kind,e.status,d?.device_model,d?.android_version,d?.app_version,d?.pairing_pin,d?.device_id]
          .filter(Boolean).join(" ").toLowerCase().includes(q);
      });
    }
    items=items.filter(e=>{
      const stale=Number(e.last_seen||0)>0&&(Date.now()/1000-Number(e.last_seen))>7*86400;
      if(activeFilter==="online")return !!e.online;
      if(activeFilter==="offline")return !e.online;
      if(activeFilter==="android")return e.kind==="android";
      if(activeFilter==="web")return e.kind!=="android";
      if(activeFilter==="pending")return e.status==="pending";
      if(activeFilter==="stale")return stale;
      return true;
    });
    const sort=els.endpointSort.value;
    if(sort==="name")items.sort((a,b)=>String(a.display_name||a.endpoint_id).localeCompare(String(b.display_name||b.endpoint_id)));
    else if(sort==="online")items.sort((a,b)=>Number(!!b.online)-Number(!!a.online)||Number(b.last_seen||0)-Number(a.last_seen||0));
    else if(sort==="stale")items.sort((a,b)=>Number(a.last_seen||0)-Number(b.last_seen||0));
    else items.sort((a,b)=>Number(b.last_seen||0)-Number(a.last_seen||0));
    return items;
  }

  function renderEndpoints(){
    els.endpointCount.textContent=endpoints.length;
    els.onlineCount.textContent=endpoints.filter(e=>e.online).length;
    els.pendingCount.textContent=endpoints.filter(e=>e.status==="pending").length;

    const items=filteredEndpoints();
    els.endpointEmpty.style.display=items.length?"none":"block";
    els.endpointEmpty.textContent=endpoints.length?"No endpoints match this filter.":"Connect to load endpoints.";
    els.endpointList.innerHTML="";

    for(const e of items){
      const d=deviceForEndpoint(e),caps=e.capabilities||{},isAndroid=e.kind==="android";
      const card=document.createElement("article");
      card.className=`endpoint-card ${e.online?"":"offline"} ${e.status==="pending"?"pending":""}`;

      card.innerHTML=`
        <div class="endpoint-main">
          <div>
            <div class="endpoint-title-row">
              <h3>${esc(e.display_name||e.endpoint_id)}</h3>
              <span class="badge ${isAndroid?"android":"web"}">${isAndroid?"Native Android":"Web endpoint"}</span>
            </div>
            <div class="meta">
              <span class="status"><i class="dot ${e.online?"online":""}"></i>${e.online?"Online":"Offline"}</span>
              <span class="status-${esc(e.status)}">${esc(e.status)}</span>
              ${d?.android_version?`<span>Android ${esc(d.android_version)}</span>`:""}
              ${d?.app_version?`<span>App ${esc(d.app_version)}</span>`:""}
              ${d?`<span>${Number(d.pair_count||0)} paired</span>`:""}
              <span>Seen ${ago(e.last_seen)}</span>
            </div>
            <div class="idcode">${esc(e.endpoint_id)}</div>
          </div>

          <div class="route-block">
            <span class="label">ROUTES</span>
            <strong class="route-value">${Number(e.incoming_count||0)} in / ${Number(e.outgoing_count||0)} out</strong>
            <div class="mode-badges"><span class="badge">Pulse ${caps.pulse?"✓":"—"}</span><span class="badge">Audio ${caps.audio?"✓":"—"}</span></div>
          </div>

          <div class="device-block">
            ${d?`
              <span class="label">PERMANENT PIN</span><strong class="pin-value">${esc(d.pairing_pin||"—")}</strong>
              <div class="mode-badges"><span class="badge">Current: ${esc(modeLabel(d.current_mode))}</span><span class="badge desired">Desired: ${esc(modeLabel(d.desired_mode))}</span></div>
            `:`<span class="label">ENDPOINT</span><div class="mode-badges"><span class="badge">${isAndroid?"No native record matched":"Browser endpoint"}</span></div>`}
          </div>

          <div class="endpoint-actions">
            ${e.status==="pending"?'<button class="approve primary">Approve</button><button class="reject">Reject</button>':""}
            <button class="details-btn">Details</button>
            <div class="more-wrap">
              <button class="more-btn" aria-label="More actions">⋮</button>
              <div class="more-menu">
                ${d?'<button class="copy-pin">Copy permanent PIN</button>':""}
                <button class="copy-id">Copy endpoint ID</button>
                ${d?'<button class="clear-state warning-item">Clear device state</button>':""}
                <button class="delete-endpoint danger-item">Delete endpoint</button>
              </div>
            </div>
          </div>
        </div>

        ${d?`
          <div class="native-control-row">
            <div class="endpoint-control-grid">
              <select class="mode-select">
                <option value="transmit">Loop Transmit</option><option value="broadcast">Loop Broadcast</option>
                <option value="listen">Loop Listen</option><option value="talk">Talk</option><option value="stop">Stop</option>
              </select>
              <button class="apply-mode primary">Apply</button>
              <div class="secondary-row"><button class="pulse-device">Pulse</button><button class="check-config">Refresh Config</button><button class="check-update">Check Update</button></div>
            </div>
          </div>`:""}

        <div class="endpoint-details">
          <div class="detail-box"><span>ENDPOINT ID</span><code>${esc(e.endpoint_id)}</code></div>
          <div class="detail-box"><span>TYPE</span><strong>${esc(e.kind)}</strong></div>
          <div class="detail-box"><span>STATUS</span><strong>${esc(e.status)}</strong></div>
          <div class="detail-box"><span>LAST SEEN</span><strong>${ago(e.last_seen)}</strong></div>
          ${d?`<div class="detail-box"><span>MODEL</span><strong>${esc(d.device_model||"Unknown")}</strong></div>
          <div class="detail-box"><span>ANDROID</span><strong>${esc(d.android_version||"Unknown")}</strong></div>
          <div class="detail-box"><span>APP VERSION</span><strong>${esc(d.app_version||"Unknown")}</strong></div>
          <div class="detail-box"><span>PERMANENT PIN</span><strong>${esc(d.pairing_pin||"—")}</strong></div>`:""}
        </div>`;

      const detailsBtn=card.querySelector(".details-btn");
      detailsBtn.onclick=()=>{card.classList.toggle("expanded");detailsBtn.textContent=card.classList.contains("expanded")?"Hide":"Details"};

      const moreBtn=card.querySelector(".more-btn"),menu=card.querySelector(".more-menu");
      moreBtn.onclick=ev=>{ev.stopPropagation();document.querySelectorAll(".more-menu.open").forEach(m=>m!==menu&&m.classList.remove("open"));menu.classList.toggle("open")};

      card.querySelector(".copy-id").onclick=()=>copyText(e.endpoint_id,"Endpoint ID copied");
      const copyPin=card.querySelector(".copy-pin");
      if(copyPin)copyPin.onclick=()=>copyText(d.pairing_pin||"","Permanent PIN copied");

      const clear=card.querySelector(".clear-state");
      if(clear)clear.onclick=()=>openConfirm({
        eyebrow:"CLEAR DEVICE STATE",
        title:`Clear ${e.display_name||"device"}?`,
        message:"Clear temporary audio/session and runtime state while preserving the registered device, identity and permanent PIN.",
        identity:d.device_id||e.endpoint_id,confirmText:"Clear State",dangerous:false,requireDeleteWord:false,
        action:()=>clearDeviceState(e,d)
      });

      card.querySelector(".delete-endpoint").onclick=()=>openConfirm({
        eyebrow:"DANGER ZONE",title:`Delete ${e.display_name||"endpoint"}?`,
        message:"Remove this endpoint from the registry. Associated links/pairs should be cleaned by the Worker transaction. A still-installed Android client may register again depending on server policy.",
        identity:e.endpoint_id,confirmText:"Delete Endpoint",dangerous:true,requireDeleteWord:true,
        action:()=>deleteEndpoint(e)
      });

      const approve=card.querySelector(".approve");if(approve)approve.onclick=()=>endpointAction(e,"approve");
      const reject=card.querySelector(".reject");if(reject)reject.onclick=()=>endpointAction(e,"reject");

      if(d){
        const s=card.querySelector(".mode-select");
        s.value=["transmit","broadcast","listen","talk","stop"].includes(d.desired_mode)?d.desired_mode:"transmit";
        card.querySelector(".apply-mode").onclick=()=>command(d,"mode",{mode:s.value},modeLabel(s.value));
        card.querySelector(".pulse-device").onclick=()=>command(d,"pulse",null,"Pulse sent");
        card.querySelector(".check-config").onclick=()=>command(d,"config-refresh",null,"runtime config refresh sent");
        card.querySelector(".check-update").onclick=()=>command(d,"update",null,"update check sent");
      }

      els.endpointList.append(card);
    }
    renderSelectors();
  }

  async function endpointAction(e,action){
    try{await api(`/api/admin/endpoints/${encodeURIComponent(e.endpoint_id)}/${action}`,{method:"POST"});toast(`${e.display_name||e.endpoint_id} → ${action}`);await refresh()}
    catch(err){showError(err)}
  }

  function renderLinks(){
    els.linkCount.textContent=links.length;
    els.linkList.innerHTML=links.length?"":'<div class="empty">No routes yet.</div>';
    for(const l of links){
      const row=document.createElement("div");row.className="link-row";
      row.innerHTML=`<div><strong>${esc(l.source_name||l.source_endpoint_id)}</strong> → <strong>${esc(l.target_name||l.target_endpoint_id)}</strong><small>${esc(l.source_kind)} → ${esc(l.target_kind)} • Pulse ${Number(l.pulse_enabled)?"on":"off"}</small></div><button class="danger">Remove</button>`;
      row.querySelector("button").onclick=async()=>{try{await api(`/api/admin/links/${encodeURIComponent(l.link_id)}`,{method:"DELETE"});toast("Link removed");await refresh()}catch(err){showError(err)}};
      els.linkList.append(row);
    }
  }

  async function command(d,what,body,msg){
    try{await api(`/api/admin/devices/${encodeURIComponent(d.device_id)}/${what}`,{method:"POST",body});toast(`${d.display_name||d.device_model||"Device"} → ${msg}`);await refresh()}
    catch(err){showError(err)}
  }

  async function clearDeviceState(e,d){
    try{await api(`/api/admin/devices/${encodeURIComponent(d.device_id)}/clear`,{method:"POST"});closeModal();toast(`${e.display_name||"Device"} state cleared`);await refresh()}
    catch(err){closeModal();showError(err.status===404?new Error("Clear API not deployed: add POST /api/admin/devices/:deviceId/clear to the Worker."):err)}
  }

  async function deleteEndpoint(e){
    try{await api(`/api/admin/endpoints/${encodeURIComponent(e.endpoint_id)}`,{method:"DELETE"});closeModal();toast(`${e.display_name||"Endpoint"} deleted`);await refresh()}
    catch(err){closeModal();showError(err.status===404?new Error("Delete API not deployed: add DELETE /api/admin/endpoints/:endpointId to the Worker."):err)}
  }

  async function copyText(v,msg){try{await navigator.clipboard.writeText(String(v||""));toast(msg)}catch{toast("Copy failed")}}

  function openConfirm(c){
    modalAction=c.action;els.modalEyebrow.textContent=c.eyebrow;els.modalTitle.textContent=c.title;els.modalMessage.textContent=c.message;els.modalIdentity.textContent=c.identity;
    els.modalConfirmBtn.textContent=c.confirmText;els.modalConfirmBtn.className=c.dangerous?"danger":"primary";els.deleteConfirmWrap.hidden=!c.requireDeleteWord;
    els.deleteConfirmInput.value="";els.modalConfirmBtn.disabled=!!c.requireDeleteWord;els.confirmModal.classList.add("show");els.confirmModal.setAttribute("aria-hidden","false");
  }
  function closeModal(){modalAction=null;els.confirmModal.classList.remove("show");els.confirmModal.setAttribute("aria-hidden","true")}

  async function refresh(){
    const [e,l,d]=await Promise.all([api("/api/admin/endpoints"),api("/api/admin/links"),api("/api/admin/devices")]);
    endpoints=e.items||[];links=l.items||[];devices=d.items||[];
    els.cloudState.className="pill ok";els.cloudState.textContent="Admin API connected";els.lastRefresh.textContent=`Updated ${new Date().toLocaleTimeString()}`;
    renderEndpoints();renderLinks();
  }

  async function connect(){
    const value=els.apiUrl.value.trim().replace(/\/+$/,"");if(!/^https:\/\//i.test(value)&&!/^http:\/\/(localhost|127\.0\.0\.1)/i.test(value))throw new Error("Use an HTTPS Worker URL.");
    const t=els.adminToken.value.trim();if(!t)throw new Error("Enter the admin token.");sessionStorage.setItem(API_KEY,value);sessionStorage.setItem(TOKEN_KEY,t);
    await refresh();clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)refresh().catch(showError)},15000);
  }

  function showError(e){console.error(e);els.cloudState.className="pill bad";els.cloudState.textContent=e?.message||"Admin API error";toast(e?.message||String(e))}

  els.createLinkBtn.onclick=async()=>{
    const source=els.source.value,target=els.target.value;if(!source||!target)return toast("Choose both endpoints");if(source===target)return toast("Choose two different endpoints");
    try{await api("/api/admin/links",{method:"POST",body:{source_endpoint_id:source,target_endpoint_id:target,direction:els.direction.value}});toast(els.direction.value==="both"?"Bidirectional link created":"Link created");await refresh()}catch(e){showError(e)}
  };

  els.connectBtn.onclick=()=>connect().catch(showError);els.refreshBtn.onclick=()=>refresh().catch(showError);
  els.adminToken.onkeydown=e=>{if(e.key==="Enter")connect().catch(showError)};
  els.endpointSearch.oninput=renderEndpoints;els.endpointSort.onchange=renderEndpoints;
  els.endpointFilters.onclick=e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;els.endpointFilters.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderEndpoints()};
  document.addEventListener("click",e=>{if(!e.target.closest(".more-wrap"))document.querySelectorAll(".more-menu.open").forEach(m=>m.classList.remove("open"))});
  document.querySelectorAll("[data-close-modal]").forEach(b=>b.onclick=closeModal);
  els.deleteConfirmInput.oninput=()=>{els.modalConfirmBtn.disabled=els.deleteConfirmInput.value.trim()!=="DELETE"};
  els.modalConfirmBtn.onclick=async()=>{if(!modalAction)return;els.modalConfirmBtn.disabled=true;try{await modalAction()}finally{if(els.confirmModal.classList.contains("show"))els.modalConfirmBtn.disabled=false}};
  window.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});

  els.apiUrl.value=sessionStorage.getItem(API_KEY)||DEFAULT_API;els.adminToken.value=sessionStorage.getItem(TOKEN_KEY)||"";
  if(token())connect().catch(showError);
})();