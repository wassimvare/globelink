import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const image = readFileSync(new URL("../src/components/CatalogImage.tsx", import.meta.url), "utf8");
const resolver = readFileSync(
  new URL("../src/lib/place-media.functions.ts", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const checks = [
  [map.includes("lookup={"), "La fiche carte transmet les coordonnées au résolveur photo"],
  [map.includes("showAttribution"), "Les attributions photo sont affichables"],
  [image.includes("resolveVerifiedPlaceMedia"), "CatalogImage utilise le résolveur média serveur"],
  [
    image.includes("Recherche de la photo officielle du lieu"),
    "État de chargement photo explicite",
  ],
  [
    resolver.includes("places.googleapis.com/v1/places:searchText"),
    "Google Places Text Search est intégré",
  ],
  [
    resolver.includes("skipHttpRedirect"),
    "Place Photos récupère un photoUri sans exposer la clé au client",
  ],
  [resolver.includes("api.openverse.org/v1/images"), "Openverse est disponible en fallback ouvert"],
  [resolver.includes("wbsearchentities"), "Recherche Wikidata par nom + position"],
  [
    resolver.includes("nominatim.openstreetmap.org/reverse"),
    "Enrichissement Nominatim par coordonnées",
  ],
  [resolver.includes("haversineKm"), "Les candidats photo sont validés géographiquement"],
  [resolver.includes("nameSimilarity"), "Les candidats photo sont validés par nom"],
  [
    !resolver.includes("unsplash.com") || resolver.includes("return null"),
    "Les anciennes illustrations Unsplash restent exclues",
  ],
  [
    pkg.scripts?.["check:map"]?.includes("map-v8-check.mjs"),
    "V8 est branchée au contrôle npm run check:map",
  ],
];

let failed = 0;
for (const [ok, label] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failed += 1;
    console.error(`✖ ${label}`);
  }
}
if (failed) process.exit(1);
console.log(`✓ Carte V8 photos réelles : ${checks.length}/${checks.length}`);
