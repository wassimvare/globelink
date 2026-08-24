import fs from "node:fs";

const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const catalog = fs.readFileSync(
  new URL("../src/lib/public-travel-catalog.functions.ts", import.meta.url),
  "utf8",
);
const live = fs.readFileSync(new URL("../src/lib/live-catalog.ts", import.meta.url), "utf8");

const checks = [
  [
    "chargement par viewport branché",
    map.includes("onViewportChange={setViewport}") &&
      map.includes("fetchLiveViewportCatalog(viewport!)") &&
      map.includes("<ViewportReporter"),
  ],
  [
    "rechargement après déplacement/zoom",
    map.includes("useMapEventsHook({") && map.includes("moveend:") && map.includes("zoomend:"),
  ],
  [
    "anti-spam viewport temporisé",
    map.includes("timerRef.current = setTimeout") && map.includes("delay = 220"),
  ],
  [
    "clusters présents",
    map.includes("clusterPlaces(places, currentZoom)") && map.includes("clique pour zoomer"),
  ],
  [
    "requête Overpass par zone visible",
    catalog.includes("buildViewportOverpassQuery") &&
      catalog.includes("getViewportInternetCatalog"),
  ],
  [
    "protection des requêtes trop larges",
    catalog.includes("if (data.zoom < 5) return []") &&
      catalog.includes("latSpan > 35 || lngSpan > 50"),
  ],
  [
    "cache viewport serveur",
    catalog.includes("const key = `viewport:") && catalog.includes("memoryCache.set(key"),
  ],
  ["limite adaptative selon zoom", catalog.includes("data.zoom >= 13 ? 450")],
  [
    "catégories utiles sans parasites",
    catalog.includes('category: "restaurant"') &&
      catalog.includes('category: "hotel"') &&
      catalog.includes('category: "activite"') &&
      !catalog.includes('category: "pharmacie"') &&
      !catalog.includes('category: "distributeur"') &&
      !catalog.includes('category: "bar"'),
  ],
  [
    "client live-catalog expose viewport",
    live.includes("export async function fetchViewportCatalog"),
  ],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
}
if (failures) process.exit(1);
console.log(`\n✓ Carte V2 : ${checks.length}/${checks.length} contrôles réussis.`);
