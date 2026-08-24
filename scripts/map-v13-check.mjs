import fs from "node:fs";

const sourceRouting = fs.readFileSync(
  new URL("../src/lib/catalog-source-routing.ts", import.meta.url),
  "utf8",
);
const liveCatalog = fs.readFileSync(new URL("../src/lib/live-catalog.ts", import.meta.url), "utf8");
const publicCatalog = fs.readFileSync(
  new URL("../src/lib/public-travel-catalog.functions.ts", import.meta.url),
  "utf8",
);
const browserCatalog = fs.readFileSync(
  new URL("../src/lib/browser-viewport-catalog.ts", import.meta.url),
  "utf8",
);
const googleDestinationCatalog = fs.readFileSync(
  new URL("../src/lib/google-destination-catalog.functions.ts", import.meta.url),
  "utf8",
);
const worldActivities = fs.readFileSync(
  new URL("../src/lib/world-activities.ts", import.meta.url),
  "utf8",
);
const catalogImage = fs.readFileSync(
  new URL("../src/components/CatalogImage.tsx", import.meta.url),
  "utf8",
);

const checks = [
  ["hôtels vers Booking.com", sourceRouting, /booking\.com\/searchresults\.fr\.html/],
  ["activités vers GetYourGuide", sourceRouting, /getyourguide\.fr\/s\//],
  ["restaurants vers Google Maps", sourceRouting, /Google Maps/],
  ["Uber Eats en source secondaire restaurant", sourceRouting, /Uber Eats/],
  ["Tripadvisor en source secondaire", sourceRouting, /Tripadvisor activités/],
  ["clé API Booking préparée", sourceRouting, /BOOKING_PARTNER_API_KEY/],
  ["clé API GetYourGuide préparée", sourceRouting, /GETYOURGUIDE_PARTNER_API_KEY/],
  ["cache par source préparé", sourceRouting, /source_cache_ttl_ms/],
  ["catalogue Supabase enrichi", liveCatalog, /enrichCatalogRow/],
  ["OpenStreetMap serveur enrichi", publicCatalog, /enrichSpecializedCatalogSource/],
  ["OpenStreetMap navigateur enrichi", browserCatalog, /enrichSpecializedCatalogSource/],
  ["Google Places enrichi", googleDestinationCatalog, /enrichSpecializedCatalogSource/],
  ["activités éditoriales enrichies", worldActivities, /enrichSpecializedCatalogSource/],
  ["images privilégient site officiel", catalogImage, /official_website/],
];

let failed = 0;
for (const [label, source, pattern] of checks) {
  const ok = pattern.test(source);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed += 1;
}

console.log(`Carte V13 sources spécialisées: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
