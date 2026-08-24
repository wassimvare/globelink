import fs from "node:fs";
const publicFn = fs.readFileSync(
  new URL("../src/lib/public-travel-catalog.functions.ts", import.meta.url),
  "utf8",
);
const live = fs.readFileSync(new URL("../src/lib/live-catalog.ts", import.meta.url), "utf8");
const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const checks = [
  ["échantillonnage régional présent", publicFn.includes("sampledViewportPoints")],
  ["requêtes autour de petits rayons", publicFn.includes("buildAroundOverpassQuery")],
  [
    "plusieurs miroirs Overpass",
    publicFn.includes("overpass.openstreetmap.fr") && publicFn.includes("overpass.kumi.systems"),
  ],
  ["fallback GET Overpass", publicFn.includes('url.searchParams.set("data", query)')],
  [
    "requête bbox réservée aux zones fines",
    publicFn.includes("zoom >= 10 || (latSpan <= 1.8 && lngSpan <= 2.4)"),
  ],
  [
    "catalogue Supabase utilisé en fallback viewport",
    live.includes('.gte("latitude", bounds.south)') &&
      live.includes('.lte("longitude", bounds.east)'),
  ],
  ["fusion internet + base", live.includes("[...localRows, ...databaseRows, ...internetRows]")],
  [
    "chargement automatique viewport toujours branché",
    map.includes("onViewportChange={setViewport}") &&
      map.includes("<ViewportReporter") &&
      map.includes("useMapEventsHook({"),
  ],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`\n✓ Carte V3 robuste : ${checks.length}/${checks.length} contrôles réussis.`);
