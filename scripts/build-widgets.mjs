import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const sdk = fileURLToPath(import.meta.resolve("piphi-network-widget-sdk"));
const root = new URL("../", import.meta.url);
const integration = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const packages = [
  ["recently-added", "Recently Added"],
  ["continue-watching", "Continue Watching"],
  ["library-search", "Plex Search / Library"],
];
for (const [slug, name] of packages) {
  const directory = new URL(`widgets/${slug}/`, root);
  await mkdir(new URL("dist/", directory), { recursive: true });
  const outfile = new URL("dist/widget.js", directory);
  await build({ entryPoints: [new URL("widgets/live-media/entry.js", root).pathname],
    outfile: outfile.pathname, bundle: true, format: "esm", target: "es2022",
    alias: { "piphi-network-widget-sdk": sdk }, minify: false,
  });
  const bytes = await readFile(outfile);
  const manifest = {
    id: `io.piphi.plex.${slug}`, name, version: "0.1.0", entry: "./dist/widget.js",
    integrity: `sha384-${createHash("sha384").update(bytes).digest("base64")}`,
    binding_modes: ["read"], value_kinds: ["json"], capability_requirements: [],
    sdk_compatibility: { minimum: "0.5.0" }, settings_schema_version: "1",
    conformance: { accessibility: "wcag2.2-aa", keyboard: true, themes: ["light", "dark"], directions: ["ltr", "rtl"],
      states: ["loading", "live", "stale", "offline", "reconnecting", "denied", "error"] },
    previews: { light: "./preview-light.svg", dark: "./preview-dark.svg" },
    settings: [
      { id: "title", type: "text", label: "Title", default: name },
      { id: "limit", type: "number", label: "Items (1–24)", default: 8 },
      { id: "refreshSeconds", type: "number", label: "Refresh seconds (15–300)", default: 60 },
      { id: "showSummary", type: "boolean", label: "Show summaries", default: true },
      ...(slug === "library-search" ? [
        { id: "query", type: "text", label: "Search query (all server libraries)", default: "" },
        { id: "collectionId", type: "text", label: "Library ID (used when query is empty)", default: "" },
      ] : []),
    ],
    layout: { min_height: 240, default_height: 440, max_height: 800 },
    security: { permissions: ["host.queryMedia"], sandbox: ["allow-scripts"], csp: { connect_src: [] } },
  };
  await writeFile(new URL("widget.manifest.json", directory), JSON.stringify(manifest, null, 2) + "\n");
  for (const theme of ["light", "dark"]) {
    await writeFile(new URL(`preview-${theme}.svg`, directory), `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" rx="16" fill="${theme === "dark" ? "#0f172a" : "#ffffff"}"/><g font-family="sans-serif" fill="${theme === "dark" ? "#f1f5f9" : "#0f172a"}"><text x="24" y="38" font-size="20">${name}</text><text x="24" y="68" font-size="12">Live Plex library</text>${[0, 1, 2].map((i) => `<rect x="24" y="${90 + i * 64}" width="350" height="52" rx="10" fill="none" stroke="#e5a00d"/><text x="40" y="${122 + i * 64}" font-size="14">${["Movie night", "The next episode", "Your library"][i]}</text>`).join("")}</g></svg>`);
  }
  const registered = { ...manifest, entry: `/media/providers/plex/widgets/${slug}/widget.js`, runtime: "prebuilt_bundle",
    previews: { light: `/media/providers/plex/widgets/${slug}/preview-light.svg`, dark: `/media/providers/plex/widgets/${slug}/preview-dark.svg` },
    host_bridge: { protocol: "piphi.widget.host", version: "1", events: ["ready", "resize"] } };
  integration.ui.widget_packages = integration.ui.widget_packages.filter((pkg) => pkg.id !== manifest.id);
  integration.ui.widget_packages.push(registered);
}
await writeFile(new URL("manifest.json", root), JSON.stringify(integration, null, 2) + "\n");
