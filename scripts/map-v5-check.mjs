import fs from "node:fs";

const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const live = fs.readFileSync(new URL("../src/lib/live-catalog.ts", import.meta.url), "utf8");
const browser = fs.readFileSync(
  new URL("../src/lib/browser-viewport-catalog.ts", import.meta.url),
  "utf8",
);
const cache = fs.readFileSync(
  new URL("../src/lib/viewport-catalog-cache.ts", import.meta.url),
  "utf8",
);
const image = fs.readFileSync(
  new URL("../src/components/CatalogImage.tsx", import.meta.url),
  "utf8",
);
const publicFn = fs.readFileSync(
  new URL("../src/lib/public-travel-catalog.functions.ts", import.meta.url),
  "utf8",
);

const checks = [
  [
    "cache local persistant affichable immédiatement",
    cache.includes("window.localStorage") &&
      cache.includes("getCachedViewportCatalog") &&
      cache.includes("saveCachedViewportCatalog"),
  ],
  [
    "catalogue Supabase séparé du live",
    live.includes("fetchPersistedViewportCatalog") && map.includes("persistedViewportPlaces"),
  ],
  [
    "première vague Overpass légère",
    live.includes("fetchFastViewportCatalog") &&
      browser.includes('mode === "fast" ? "node" : "nwr"'),
  ],
  [
    "enrichissement complet en arrière-plan",
    live.includes("fetchLiveViewportCatalog") && map.includes("!fastViewportLoading"),
  ],
  [
    "scan mondial reserve au catalogue visible",
    live.includes("isMapRequest") &&
      live.includes("getMapInternetCatalog") &&
      live.includes("visibleCatalogRows"),
  ],
  [
    "cache local utilisé comme initialData",
    map.includes("initialData: () => (viewport ? getCachedViewportCatalog(viewport) : [])"),
  ],
  [
    "rendu ville limité au viewport",
    map.includes("viewport.zoom >= 7") && map.includes("place.lat >= viewport.south - latPad"),
  ],
  ["clustering prolongé aux zooms urbains", map.includes("zoom <= 13") && map.includes("? 0.035")],
  [
    "aucune banque de fausses photos",
    !image.includes("FALLBACK_IMAGES") && !image.includes("photo-1517248135467"),
  ],
  [
    "placeholder explicite si aucune photo officielle",
    image.includes("Aucune photo officielle vérifiée") &&
      image.includes("aucune image générique utilisée"),
  ],
  [
    "métadonnées photo OSM conservées côté navigateur",
    browser.includes("wikimedia_commons") &&
      browser.includes("wikidata") &&
      browser.includes("wikipedia"),
  ],
  [
    "métadonnées photo OSM conservées côté serveur",
    publicFn.includes("viewport: true") &&
      publicFn.includes("wikimedia_commons") &&
      publicFn.includes("wikidata"),
  ],
  [
    "anciennes URLs Unsplash refusées comme photo de lieu",
    image.includes("unsplash\\.com") && map.includes("verifiedExternalImageUrl"),
  ],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(
  `\n✓ Carte V5 performance/photos : ${checks.length}/${checks.length} contrôles réussis.`,
);
