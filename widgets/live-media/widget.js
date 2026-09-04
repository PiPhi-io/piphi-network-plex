/** Shared renderer for the three SDK packages. All Plex access stays in Core. */
export async function mountLiveMediaWidget(host, root, timer = globalThis) {
  const [settings, context] = await Promise.all([host.getSettings(), host.getContext()]);
  const names = {
    "io.piphi.plex.recently-added": "Recently Added",
    "io.piphi.plex.continue-watching": "Continue Watching",
    "io.piphi.plex.library-search": "Plex Search / Library",
  };
  root.innerHTML = `<style>
    :root { color-scheme:light dark; font:14px/1.5 system-ui,sans-serif; }
    * { box-sizing:border-box; } main { height:100%; padding:18px; background:Canvas; color:CanvasText; overflow:auto; }
    header { display:flex; justify-content:space-between; align-items:center; gap:12px; }
    h2 { margin:0; font-size:1.1rem; } button { border:0; border-radius:10px; padding:9px 12px; background:#e5a00d; color:#161616; font-weight:700; cursor:pointer; }
    button:disabled { opacity:.5; cursor:wait; } button:focus-visible { outline:3px solid #e5a00d; outline-offset:3px; }
    .source,.status { font-size:.8rem; opacity:.75; overflow-wrap:anywhere; } .status { margin:12px 0; }
    .status[data-state=error],.status[data-state=stale] { color:light-dark(#9a3412,#fdba74); opacity:1; }
    ul { list-style:none; margin:0; padding:0; display:grid; gap:10px; }
    li { border:1px solid color-mix(in srgb,CanvasText 18%,transparent); border-radius:14px; padding:12px; }
    h3 { margin:0; font-size:.95rem; overflow-wrap:anywhere; } .meta { font-size:.75rem; opacity:.7; }
    .summary { margin:5px 0 0; font-size:.8rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    progress { width:100%; height:7px; accent-color:#e5a00d; } .empty { padding:24px 0; text-align:center; opacity:.75; }
  </style><main><header><h2></h2><button type="button">Refresh</button></header>
  <div class="source"></div><p class="status" role="status" aria-live="polite">Loading Plex…</p>
  <ul aria-label="Plex media"></ul><p class="empty" hidden>No matching media on this server.</p></main>`;
  const title = root.querySelector("h2");
  const status = root.querySelector(".status");
  status.dataset.state = "loading";
  const list = root.querySelector("ul");
  const empty = root.querySelector(".empty");
  const button = root.querySelector("button");
  const doc = root.ownerDocument;
  title.textContent = String(settings.title || names[context.packageId] || "Plex");
  root.querySelector(".source").textContent = String(context.props?.machineId || "Select a Plex server");
  const configuredInterval = Number(settings.refreshSeconds ?? 60);
  const interval = (Number.isFinite(configuredInterval) ? Math.max(15, Math.min(300, configuredInterval)) : 60) * 1000;
  let disposed = false;
  let busy = false;
  let handle;
  let failures = 0;
  let hasData = false;

  function render(items) {
    list.replaceChildren();
    for (const item of items) {
      const card = doc.createElement("li");
      const heading = doc.createElement("h3");
      heading.textContent = String(item.title || "Untitled");
      const meta = doc.createElement("div");
      meta.className = "meta";
      meta.textContent = [item.kind, item.year, item.artist].filter(Boolean).join(" · ");
      card.append(heading, meta);
      if (item.summary && settings.showSummary !== false) {
        const summary = doc.createElement("p");
        summary.className = "summary";
        summary.textContent = String(item.summary);
        card.append(summary);
      }
      const duration = Number(item.duration_seconds);
      const offset = Number(item.view_offset_seconds);
      if (Number.isFinite(duration) && duration > 0 && Number.isFinite(offset) && offset > 0) {
        const progress = doc.createElement("progress");
        progress.max = duration; progress.value = Math.min(duration, offset);
        progress.setAttribute("aria-label", `${item.title || "Media"}: ${Math.round(progress.value / duration * 100)}% watched`);
        card.append(progress);
      }
      list.append(card);
    }
    empty.hidden = items.length > 0;
  }

  async function refresh() {
    if (disposed || busy) return;
    timer.clearTimeout(handle);
    busy = true; button.disabled = true;
    if (failures) { status.dataset.state = "reconnecting"; status.textContent = "Reconnecting to Plex…"; }
    try {
      // SDK 0.3 generic request extension; the parent owns all query parameters.
      const result = await host.request("host.queryMedia");
      if (disposed) return;
      if (!Array.isArray(result?.items)) throw new Error("Invalid media response");
      render(result.items); hasData = true; failures = 0;
      status.dataset.state = "live";
      status.textContent = `Live · updated ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      if (disposed) return;
      failures++;
      const message = String(error?.message || "");
      status.dataset.state = hasData ? "stale" : /denied|permission/i.test(message) ? "denied" : /unavailable|offline/i.test(message) ? "offline" : "error";
      status.textContent = hasData ? "Connection lost · showing previous results. Retrying…" : "Unable to load Plex. Check access, server, and widget settings. Retrying…";
    } finally {
      busy = false; button.disabled = false;
      if (!disposed) handle = timer.setTimeout(() => void refresh(), Math.min(300000, interval * 2 ** Math.min(failures, 3)));
    }
  }
  const click = () => void refresh();
  button.addEventListener("click", click);
  await host.ready({ height: 440 });
  void refresh();
  return () => { disposed = true; timer.clearTimeout(handle); button.removeEventListener("click", click); };
}
