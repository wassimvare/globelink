import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const sourceRouting = read("src/lib/catalog-source-routing.ts");
const liveCatalog = read("src/lib/live-catalog.ts");
const publicCatalog = read("src/lib/public-travel-catalog.functions.ts");
const browserCatalog = read("src/lib/browser-viewport-catalog.ts");
const map = read("src/routes/map.tsx");
const catalogImage = read("src/components/CatalogImage.tsx");
const activitiesIndex = read("src/routes/activities.index.tsx");
const pkg = JSON.parse(read("package.json"));

const blockedQueryTerms = [
  "pharmacy",
  "atm",
  "bar|pub",
  "nightclub",
  'category: "pharmacie"',
  'category: "distributeur"',
  'category: "bar"',
  'category: "vie_nocturne"',
];

const hasBlockedQueryTerm = (source) => blockedQueryTerms.some((term) => source.includes(term));

const checks = [
  [
    "filtre visible distinct du strict officiel",
    sourceRouting.includes("TRUSTED_VISIBLE_SOURCE_VERSION") &&
      sourceRouting.includes("isTrustedVisibleCatalogItem") &&
      sourceRouting.includes("BLOCKED_VISIBLE_CATEGORIES"),
  ],
  [
    "catalogue live réactive les flux sans vider la carte",
    liveCatalog.includes("getMapInternetCatalog") &&
      liveCatalog.includes("getHomepageInternetCatalog") &&
      liveCatalog.includes("fetchBrowserViewportCatalog") &&
      liveCatalog.includes("visibleCatalogRows"),
  ],
  [
    "carte utilise le filtre visible",
    map.includes("isTrustedVisibleCatalogItem(item)") &&
      !map.includes("isStrictOfficialCatalogItem(item)"),
  ],
  [
    "Overpass serveur ne requête plus pharmacie, bar, ATM ou nightclub",
    !hasBlockedQueryTerm(publicCatalog),
  ],
  [
    "Overpass navigateur ne requête plus pharmacie, bar, ATM ou nightclub",
    !hasBlockedQueryTerm(browserCatalog),
  ],
  [
    "fiches établissement sans photo de destination",
    !catalogImage.includes("fetchVerifiedDestinationCovers") &&
      !catalogImage.includes("Photo de destination") &&
      catalogImage.includes("Aucune photo officielle vérifiée"),
  ],
  [
    "page activités annonce le bon niveau de vérification",
    activitiesIndex.includes("lieu est traçable") &&
      activitiesIndex.includes("Aucune image générique") &&
      activitiesIndex.includes("Photo exacte quand"),
  ],
  ["V15 branchée au contrôle npm", pkg.scripts?.["check:map"]?.includes("map-v15-check.mjs")],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}

console.log(
  `Carte V15 anti-vide et anti-fausses sources: ${checks.length - failed}/${checks.length}`,
);
if (failed) process.exit(1);
