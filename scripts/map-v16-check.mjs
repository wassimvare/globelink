import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const officialApis = read("src/lib/official-catalog-apis.functions.ts");
const liveCatalog = read("src/lib/live-catalog.ts");
const sourceRouting = read("src/lib/catalog-source-routing.ts");
const syncCatalog = read("supabase/functions/sync-travel-catalog/index.ts");
const apiSetupBat = read("CONFIGURER_APIS_OFFICIELLES.bat");
const apiSetupPs1 = read("CONFIGURER_APIS_OFFICIELLES.ps1");
const pkg = JSON.parse(read("package.json"));

const checks = [
  [
    "connecteurs API officiels installés",
    officialApis.includes("OFFICIAL_CATALOG_API_VERSION") &&
      officialApis.includes("fetchBookingHotels") &&
      officialApis.includes("fetchTripadvisorActivities") &&
      officialApis.includes("fetchGetYourGuideActivities") &&
      officialApis.includes("fetchYelpRestaurants") &&
      officialApis.includes("getOfficialCatalogApiStatus"),
  ],
  [
    "clés API jamais exposées en VITE",
    officialApis.includes("BOOKING_API_TOKEN") &&
      officialApis.includes("TRIPADVISOR_API_KEY") &&
      officialApis.includes("GETYOURGUIDE_API_KEY") &&
      officialApis.includes("YELP_API_KEY") &&
      officialApis.includes("process.env[name]") &&
      !officialApis.includes("VITE_"),
  ],
  [
    "catalogue live priorise les APIs officielles",
    liveCatalog.includes("fetchOfficialProviderCatalog") &&
      liveCatalog.includes("fetchOfficialRows") &&
      liveCatalog.includes("APIs officielles"),
  ],
  [
    "sync Supabase importe aussi les APIs spécialisées",
    syncCatalog.includes("BOOKING_API_TOKEN") &&
      syncCatalog.includes("TRIPADVISOR_API_KEY") &&
      syncCatalog.includes("GETYOURGUIDE_API_KEY") &&
      syncCatalog.includes("YELP_API_KEY") &&
      syncCatalog.includes("fetchBookingHotels") &&
      syncCatalog.includes("fetchYelpRestaurants"),
  ],
  [
    "routes sources listent les nouvelles variables",
    sourceRouting.includes("BOOKING_API_TOKEN") &&
      sourceRouting.includes("GETYOURGUIDE_API_KEY") &&
      sourceRouting.includes("YELP_API_KEY"),
  ],
  [
    "filtre visible garde la carte remplie quand les clés manquent",
    sourceRouting.includes("if (isStrictOfficialCatalogItem(item)) return true;") &&
      sourceRouting.includes("hasKnownPlaceProof(item)") &&
      sourceRouting.includes("curated_country_activity") &&
      sourceRouting.includes("ACTIVITY_CATEGORIES.has(category)"),
  ],
  [
    "connecteurs ignorent les fiches sans photo officielle",
    officialApis.match(/if \(!imageUrl\) return \[\];/g)?.length >= 3 &&
      officialApis.includes("if (!imageUrl) continue;") &&
      syncCatalog.match(/if \(!imageUrl\) return \[\];/g)?.length >= 3 &&
      syncCatalog.includes("if (!imageUrl) continue;"),
  ],
  [
    "diagnostic API officiel branché",
    pkg.scripts?.["check:apis"] === "node scripts/check-official-apis.mjs" &&
      officialApis.includes("getOfficialCatalogApiStatusSnapshot") &&
      officialApis.includes("missingRequiredEnvVars"),
  ],
  [
    "configuration Windows des clés API disponible",
    apiSetupBat.includes("CONFIGURER_APIS_OFFICIELLES.ps1") &&
      apiSetupPs1.includes(".env.local") &&
      apiSetupPs1.includes("Read-Host $Name -AsSecureString") &&
      apiSetupPs1.includes("npm run check:apis"),
  ],
  [
    "Booking envoie aussi l'Affiliate ID si configuré",
    officialApis.includes('"X-Affiliate-Id": affiliateId') &&
      syncCatalog.includes('"X-Affiliate-Id": BOOKING_AFFILIATE_ID'),
  ],
  ["V16 branchée au contrôle npm", pkg.scripts?.["check:map"]?.includes("map-v16-check.mjs")],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}

console.log(`Carte V16 APIs officielles: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
