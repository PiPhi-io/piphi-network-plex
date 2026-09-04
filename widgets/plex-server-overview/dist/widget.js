import { getInjectedPiPhiWidgetHost } from "piphi-network-widget-sdk";

const host = getInjectedPiPhiWidgetHost();
const root = document.querySelector("#piphi-widget-root") || document.body;
const settings = await host.getSettings();
const context = await host.getContext();
const selection = context.props || {};

root.innerHTML = `
  <style>
    :root { color-scheme: light dark; font: 14px/1.4 system-ui, sans-serif; }
    * { box-sizing: border-box; }
    main { min-height: 220px; padding: 18px; color: CanvasText; background: Canvas; }
    header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    h2 { margin:0; font-size:1rem; }
    .selection { margin-top:12px; font-size:.85rem; overflow-wrap:anywhere; }
    .selection p { margin:4px 0; }
    .status { display:inline-flex; align-items:center; gap:6px; font-size:.78rem; opacity:.75; }
    .dot { width:9px; height:9px; border-radius:50%; background:#94a3b8; }
    .dot.live { background:#22c55e; box-shadow:0 0 0 4px color-mix(in srgb,#22c55e 18%,transparent); }
    .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:20px; }
    .stat { padding:14px; border:1px solid color-mix(in srgb,CanvasText 14%,transparent); border-radius:16px; background:color-mix(in srgb,CanvasText 4%,Canvas); }
    .value { font-size:1.55rem; font-weight:760; font-variant-numeric:tabular-nums; }
    .label { margin-top:4px; font-size:.75rem; opacity:.65; }
    button { margin-top:18px; min-height:40px; width:100%; border:0; border-radius:12px; background:#e5a00d; color:#161616; font-weight:700; cursor:pointer; }
    button:focus-visible { outline:3px solid #e5a00d; outline-offset:3px; }
    @media(max-width:380px){.stats{grid-template-columns:1fr}.stat{display:flex;align-items:center;justify-content:space-between}.label{margin:0}}
  </style>
  <main>
    <header><h2></h2><span class="status"><span class="dot"></span><span class="status-text">Waiting</span></span></header>
    <section class="selection" hidden><p class="source"></p><p class="media"></p><small>Saved media selection · live account totals below</small></section>
    <section class="stats">
      <div class="stat"><div class="value servers">—</div><div class="label">Servers</div></div>
      <div class="stat"><div class="value sessions">—</div><div class="label">Streams</div></div>
      <div class="stat"><div class="value transcodes">—</div><div class="label">Transcodes</div></div>
    </section>
    <button type="button">Refresh Plex</button>
  </main>`;

root.querySelector("h2").textContent = String(settings.title || "Plex servers");
if (selection.provider === "plex" && selection.machineId) {
  root.querySelector(".selection").hidden = false;
  root.querySelector(".source").textContent = [
    selection.machineId, selection.view, selection.collectionId, selection.query,
  ].filter(Boolean).join(" · ");
  root.querySelector(".media").textContent = String(selection.item?.title || "");
}
const valueOf = (data, key, fallback = 0) => {
  const source = data?.capabilities || data?.values || data?.state || data || {};
  const value = source[key]?.value ?? source[key] ?? fallback;
  return typeof value === "object" ? fallback : value;
};
const render = (data) => {
  const connected = Boolean(valueOf(data, "connected", false));
  root.querySelector(".dot").classList.toggle("live", connected);
  root.querySelector(".status-text").textContent = connected ? "Connected" : "Offline";
  root.querySelector(".servers").textContent = String(valueOf(data, "server_count", 0));
  root.querySelector(".sessions").textContent = String(valueOf(data, "active_sessions", 0));
  root.querySelector(".transcodes").textContent = String(valueOf(data, "transcode_sessions", 0));
};

root.querySelector("button").addEventListener("click", async () => {
  const button = root.querySelector("button");
  button.disabled = true;
  try { await host.executeCommand({ commandName: "refresh", args: {} }); }
  finally { button.disabled = false; }
});

render(await host.getCapabilityState({ forceRefresh: true }));
await host.subscribeState(
  { capabilityIds: ["connected", "server_count", "active_sessions", "transcode_sessions"] },
  (event) => { if (event.kind === "snapshot" || event.kind === "point") render(event.data); },
);
await host.ready({ height: selection.provider === "plex" ? 340 : 240 });
