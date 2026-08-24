import fs from "node:fs";
const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const live = fs.readFileSync(new URL("../src/lib/live-catalog.ts", import.meta.url), "utf8");
const browser = fs.readFileSync(
  new URL("../src/lib/browser-viewport-catalog.ts", import.meta.url),
  "utf8",
);

const checks = [
  [
    "viewport émis depuis le cycle React-Leaflet",
    map.includes("function ViewportReporter") && map.includes("useMapEventsHook({"),
  ],
  [
    "moveend et zoomend déclenchent un nouveau viewport",
    map.includes("moveend: (event: any) => schedule(event.target)") &&
      map.includes("zoomend: (event: any) => schedule(event.target)"),
  ],
  ["viewport initial émis sans mouvement utilisateur", map.includes("schedule(map, 0)")],
  [
    "ancien listener fragile supprimé",
    !map.includes('map.on("moveend", emitViewport)') &&
      !map.includes('map.on("zoomend", emitViewport)'),
  ],
  [
    "fallback navigateur Overpass actif mais filtré",
    live.includes("fetchBrowserViewportCatalog") &&
      live.includes("fetchFastViewportCatalog") &&
      live.includes("visibleCatalogRows"),
  ],
  [
    "viewport live requête OpenStreetMap puis filtre les fiches",
    live.includes("getViewportInternetCatalog") &&
      live.includes("fetchLiveViewportCatalog") &&
      live.includes("filterTrustedVisibleCatalogItems"),
  ],
  [
    "requête navigateur limitée aux vues urbaines",
    browser.includes("bounds.zoom < 7") && browser.includes("latSpan > 3.2 || lngSpan > 4.5"),
  ],
  [
    "Overpass navigateur en POST simple CORS",
    browser.includes("body: `data=${encodeURIComponent(query)}`") &&
      !browser.includes("User-Agent"),
  ],
  [
    "fallback navigateur conserve uniquement les catégories utiles",
    browser.includes('category: "restaurant"') &&
      browser.includes('category: "hotel"') &&
      browser.includes('category: "activite"') &&
      !browser.includes('category: "pharmacie"') &&
      !browser.includes('category: "bar"'),
  ],
  [
    "cache navigateur présent",
    browser.includes("browserCache.set") && browser.includes("CACHE_TTL"),
  ],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`\n✓ Carte V4 viewport : ${checks.length}/${checks.length} contrôles réussis.`);
