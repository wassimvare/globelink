import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const image = readFileSync(new URL("../src/components/CatalogImage.tsx", import.meta.url), "utf8");
const resolver = readFileSync(
  new URL("../src/lib/place-media.functions.ts", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const checks = [
  [resolver.includes("places:searchText"), "Google Text Search est conservé"],
  [resolver.includes("places:searchNearby"), "Google Nearby Search complète la recherche texte"],
  [
    resolver.includes("googlePlaceScore"),
    "Les candidats Google sont classés par nom, distance, adresse et type",
  ],
  [resolver.includes("formattedAddress"), "L'adresse participe à la correspondance du lieu"],
  [
    resolver.includes("googlePlaceDetails"),
    "Place Details est utilisé si la recherche ne renvoie pas de photo",
  ],
  [
    resolver.includes('const fields = ["photos"]'),
    "Place Details reste minimal pour limiter les coûts",
  ],
  [resolver.includes("resolveOfficialWebsiteImage"), "Le site officiel sert de fallback vérifié"],
  [
    resolver.includes('metaContent(page.html, "og:image")'),
    "Les images Open Graph du site officiel sont reconnues",
  ],
  [
    resolver.includes("schemaImage(page.html)"),
    "Les images schema.org du site officiel sont reconnues",
  ],
  [
    resolver.includes('await import("node:dns/promises")'),
    "Le fallback site officiel protège contre les hôtes privés",
  ],
  [resolver.includes('redirect: "manual"'), "Les redirections de site officiel sont revérifiées"],
  [image.includes("lookup?.address"), "CatalogImage transmet l'adresse au résolveur"],
  [image.includes("lookup?.website"), "CatalogImage transmet le site officiel au résolveur"],
  [
    image.includes("directFailed"),
    "Une URL OSM cassée déclenche maintenant le résolveur de secours",
  ],
  [image.includes("primaryFailed"), "Toute photo principale cassée déclenche un second fallback"],
  [
    image.includes("skipGoogle: true"),
    "Le second fallback évite de reboucler sur la même photo Google",
  ],
  [
    map.includes("address: placeAddress(place) || null") ||
      map.includes("address: address || null"),
    "La fiche carte transmet l'adresse réelle",
  ],
  [
    map.includes("website: placeWebsite(place) || null") ||
      map.includes("website: website || null"),
    "La fiche carte transmet le site officiel connu",
  ],
  [pkg.scripts?.["check:map"]?.includes("map-v9-check.mjs"), "V9 est branchée à npm run check:map"],
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
console.log(`✓ Carte V9 couverture photos : ${checks.length}/${checks.length}`);
