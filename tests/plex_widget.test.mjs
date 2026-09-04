import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("overview renders the persisted media selection safely alongside live telemetry", async () => {
  const nodes = new Map();
  const root = {
    innerHTML: "",
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, {
        textContent: "", hidden: true,
        classList: { toggle() {} }, addEventListener() {},
      });
      return nodes.get(selector);
    },
  };
  const host = {
    getSettings: async () => ({ title: "Movie night" }),
    getContext: async () => ({ props: {
      provider: "plex", machineId: "home", view: "collection", collectionId: "1",
      item: { title: "<img src=x onerror=alert(1)>" },
    } }),
    getCapabilityState: async () => ({ connected: true, server_count: 2, active_sessions: 3, transcode_sessions: 1 }),
    subscribeState: async () => {}, ready: async () => {},
  };
  const bundle = await readFile(new URL("../widgets/plex-server-overview/dist/widget.js", import.meta.url), "utf8");
  const executable = bundle.replace(/^import .*;\n/, "");
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("getInjectedPiPhiWidgetHost", "document", executable)(
    () => host, { querySelector: () => root },
  );
  assert.equal(nodes.get("h2").textContent, "Movie night");
  assert.equal(nodes.get(".selection").hidden, false);
  assert.equal(nodes.get(".source").textContent, "home · collection · 1");
  assert.equal(nodes.get(".media").textContent, "<img src=x onerror=alert(1)>");
  assert.ok(!root.innerHTML.includes("onerror=alert"));
  assert.equal(nodes.get(".sessions").textContent, "3");
});
