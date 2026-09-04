import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mountLiveMediaWidget } from "../widgets/live-media/widget.js";

class Element {
  textContent = ""; children = []; dataset = {}; hidden = true; listeners = {};
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  removeEventListener(key) { delete this.listeners[key]; }
}
const flush = () => new Promise(setImmediate);
async function setup(initialFailure = "") {
  const nodes = new Map();
  const root = { innerHTML: "", ownerDocument: { createElement: () => new Element() }, querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  } };
  let next = { items: [{ title: "Movie", kind: "movie", duration_seconds: 100, view_offset_seconds: 25 }] };
  let fail = initialFailure;
  let scheduled;
  let count = 0;
  const host = {
    getSettings: async () => ({ title: "Movie night", refreshSeconds: 1 }),
    getContext: async () => ({ packageId: "io.piphi.plex.continue-watching", props: { machineId: "home" } }),
    ready: async () => {},
    request: async (method, params) => {
      assert.equal(method, "host.queryMedia"); assert.equal(params, undefined); count++;
      if (fail) throw new Error(fail);
      return next;
    },
  };
  const cleanup = await mountLiveMediaWidget(host, root, {
    setTimeout: (callback, delay) => { scheduled = { callback, delay }; return 1; },
    clearTimeout: () => { scheduled = undefined; },
  });
  await flush();
  return { nodes, cleanup, root, setResult(value) { next = value; }, setOffline() { fail = "offline"; },
    get scheduled() { return scheduled; }, get count() { return count; } };
}

test("renders live items, watch progress, and refreshes without accumulating stale rows", async () => {
  const widget = await setup();
  assert.equal(widget.nodes.get("h2").textContent, "Movie night");
  assert.equal(widget.nodes.get("ul").children[0].children[2].value, 25);
  assert.equal(widget.scheduled.delay, 15000);
  widget.setResult({ items: [{ title: "New movie", kind: "movie" }] });
  widget.scheduled.callback(); await flush();
  assert.equal(widget.nodes.get("ul").children.length, 1);
  assert.equal(widget.nodes.get("ul").children[0].children[0].textContent, "New movie");
  widget.cleanup(); assert.equal(widget.scheduled, undefined);
});
test("keeps previous results visibly stale on failure and backs off", async () => {
  const widget = await setup(); widget.setOffline();
  widget.scheduled.callback(); await flush();
  assert.equal(widget.nodes.get(".status").dataset.state, "stale");
  assert.equal(widget.nodes.get("ul").children.length, 1);
  assert.equal(widget.scheduled.delay, 30000); widget.cleanup();
});
test("shows empty results and renders untrusted titles as text", async () => {
  const widget = await setup();
  widget.setResult({ items: [{ title: "<script>bad()</script>" }] });
  widget.scheduled.callback(); await flush();
  assert.equal(widget.nodes.get("ul").children[0].children[0].textContent, "<script>bad()</script>");
  assert.ok(!widget.root.innerHTML.includes("bad()"));
  widget.setResult({ items: [] }); widget.scheduled.callback(); await flush();
  assert.equal(widget.nodes.get(".empty").hidden, false); widget.cleanup();
});
test("initial access denial is distinct from offline and generic errors", async () => {
  for (const [message, state] of [["access denied", "denied"], ["offline", "offline"], ["Invalid response", "error"]]) {
    const widget = await setup(message);
    assert.equal(widget.nodes.get(".status").dataset.state, state);
    widget.cleanup();
  }
});
test("manual refresh works and teardown prevents future polling", async () => {
  const widget = await setup();
  widget.nodes.get("button").listeners.click(); await flush();
  assert.equal(widget.count, 2);
  const pending = widget.scheduled.callback;
  widget.cleanup(); pending(); await flush();
  assert.equal(widget.count, 2);
});
test("all three SDK bundles have correct SRI and no unresolved package imports", async () => {
  for (const name of ["recently-added", "continue-watching", "library-search"]) {
    const base = new URL(`../widgets/${name}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("widget.manifest.json", base), "utf8"));
    const bundle = await readFile(new URL("dist/widget.js", base));
    assert.equal(manifest.integrity, `sha384-${createHash("sha384").update(bundle).digest("base64")}`);
    assert.ok(bundle.toString().includes("getInjectedPiPhiWidgetHost"));
    assert.ok(!/from ["']piphi-network-widget-sdk/.test(bundle.toString()));
    assert.deepEqual(manifest.security.permissions, ["host.queryMedia"]);
  }
});
