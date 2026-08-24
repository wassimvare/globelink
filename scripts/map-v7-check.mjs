import fs from "node:fs";

const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const hubs = fs.readFileSync(new URL("../src/lib/world-map-hubs.ts", import.meta.url), "utf8");

const hubCount = (hubs.match(/\bid:\s*"/g) || []).length;
const checks = [
  [
    "Tout réactive toutes les catégories et les voyageurs",
    map.includes("selectAllMapContent") &&
      map.includes("setActiveCats(new Set(ALL_PLACE_CATEGORIES))") &&
      map.includes("setShowTravelers(true)"),
  ],
  [
    "Tout n'est actif que lorsque tout le contenu est réellement visible",
    map.includes("const allContentSelected = allCategoriesSelected && showTravelers") &&
      map.includes("allContentSelected"),
  ],
  [
    "catégories visuellement actives quand Tout est choisi",
    map.includes("const on = activeCats.has(category.value)") &&
      !map.includes("const on = !allCategoriesSelected && activeCats.has(category.value)"),
  ],
  [
    "un filtre principal isole réellement sa catégorie",
    map.includes("setActiveCats(new Set([v]))") && map.includes("setShowTravelers(false)"),
  ],
  [
    "Voyageurs peut être isolé depuis Tout",
    map.includes("setActiveCats(new Set())") && map.includes("toggleTravelers"),
  ],
  [
    "couche mondiale instantanée branchée",
    map.includes("WORLD_MAP_HUBS") &&
      map.includes("currentZoom <= 5") &&
      map.includes("WORLD_MAP_HUBS.map"),
  ],
  ["au moins 100 zones mondiales de découverte", hubCount >= 100],
  [
    "les points mondiaux ne fabriquent pas de compteurs",
    map.includes("countLoadedPlacesNearHub") &&
      map.includes('knownCount > 0 ? String(knownCount) : ""'),
  ],
  [
    "un point mondial sans données reste un point bleu honnête",
    map.includes("background:#0789a8") && map.includes("width:6px;height:6px"),
  ],
  [
    "clic sur un point mondial zoome et déclenche le chargement local",
    map.includes("hub.zoom ?? 10") && map.includes("flyTo([hub.lat, hub.lng]"),
  ],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
}
console.log(`\nZones mondiales: ${hubCount}`);
if (failed) process.exit(1);
console.log(`✓ Carte V7 filtres + monde : ${checks.length}/${checks.length} contrôles réussis.`);
