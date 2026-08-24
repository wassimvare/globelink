import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const sourceRouting = read("src/lib/catalog-source-routing.ts");
const liveCatalog = read("src/lib/live-catalog.ts");
const map = read("src/routes/map.tsx");
const catalogImage = read("src/components/CatalogImage.tsx");
const placeMedia = read("src/lib/place-media.functions.ts");
const googleDestinationCatalog = read("src/lib/google-destination-catalog.functions.ts");
const activitiesIndex = read("src/routes/activities.index.tsx");
const activityDetail = read("src/routes/activities.$slug.tsx");
const search = read("src/lib/search.ts");
const destination = read("src/routes/destinations.$slug.tsx");
const pkg = JSON.parse(read("package.json"));

const checks = [
  [
    "politique stricte et affichage vérifiable centralisés",
    sourceRouting.includes("STRICT_OFFICIAL_SOURCE_VERSION") &&
      sourceRouting.includes("isStrictOfficialCatalogItem") &&
      sourceRouting.includes("filterStrictOfficialCatalogItems") &&
      sourceRouting.includes("TRUSTED_VISIBLE_SOURCE_VERSION") &&
      sourceRouting.includes("isTrustedVisibleCatalogItem") &&
      sourceRouting.includes("filterTrustedVisibleCatalogItems"),
  ],
  [
    "liens spécialisés marqués recherche non vérifiée",
    sourceRouting.includes("source_is_search_only: true") &&
      sourceRouting.includes('source_verification_status: "search_link_only"'),
  ],
  [
    "catalogue live garde du contenu visible sans revenir au tout-venant",
    liveCatalog.includes("visibleCatalogRows") &&
      liveCatalog.includes("filterTrustedVisibleCatalogItems(rows)") &&
      liveCatalog.includes("getViewportInternetCatalog") &&
      liveCatalog.includes("fetchBrowserViewportCatalog") &&
      liveCatalog.includes("dailyWorldActivitySelection"),
  ],
  [
    "carte bloque les fiches non fiables au dernier moment",
    map.includes("isTrustedVisibleCatalogItem(item)") &&
      map.includes('item.kind !== "deal"') &&
      map.includes("return []"),
  ],
  [
    "aucune photo de destination en fiche établissement",
    !catalogImage.includes("fetchVerifiedDestinationCovers") &&
      !catalogImage.includes("Photo de destination") &&
      catalogImage.includes("Aucune photo officielle vérifiée"),
  ],
  [
    "résolveur photo n'utilise plus Openverse par simple nom",
    placeMedia.includes("allowsOpenKnowledgeFallback") &&
      placeMedia.includes('data.kind === "activity"') &&
      placeMedia.includes("data.wikidata || data.wikipedia || data.wikimediaCommons"),
  ],
  [
    "Google Places vérifie seulement les restaurants avec photo",
    googleDestinationCatalog.includes('official_source_provider: search.kind === "restaurant"') &&
      googleDestinationCatalog.includes(
        'official_source_verified: search.kind === "restaurant" && !!photoName',
      ) &&
      googleDestinationCatalog.includes('source_is_search_only: search.kind !== "restaurant"'),
  ],
  [
    "page activités alimentée par le catalogue vérifiable",
    activitiesIndex.includes('fetchLiveCatalog({ kinds: ["activity"]') &&
      !activitiesIndex.includes("world-activities") &&
      activitiesIndex.includes("GetYourGuide ou") &&
      activitiesIndex.includes("Aucune image générique"),
  ],
  [
    "fiche activité accepte les activités connues mais filtrées",
    activityDetail.includes("isTrustedVisibleCatalogItem(external)") &&
      activityDetail.includes("curatedActivityBySlug") &&
      !activityDetail.includes("searchInternetCatalog"),
  ],
  [
    "recherche globale filtre les catalogues visibles",
    search.includes("isTrustedVisibleCatalogItem(catalogItem)") &&
      !search.includes("ALL_CURATED_WORLD_ACTIVITIES"),
  ],
  [
    "destination filtre vérifiable avant affichage",
    destination.includes("isTrustedVisibleCatalogItem(item)") &&
      destination.includes("fetchBrowserViewportCatalog") &&
      destination.includes("searchInternetCatalog"),
  ],
  ["V14 branchée au contrôle npm", pkg.scripts?.["check:map"]?.includes("map-v14-check.mjs")],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}

console.log(`Carte V14 contenu vérifiable: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
