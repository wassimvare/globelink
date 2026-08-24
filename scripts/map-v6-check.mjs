import fs from "node:fs";

const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const browser = fs.readFileSync(
  new URL("../src/lib/browser-viewport-catalog.ts", import.meta.url),
  "utf8",
);
const publicFn = fs.readFileSync(
  new URL("../src/lib/public-travel-catalog.functions.ts", import.meta.url),
  "utf8",
);

const checks = [
  [
    "recherche principale façon carte grand public",
    map.includes("Rechercher une ville, un restaurant, une activité") &&
      map.includes("submitMapSearch"),
  ],
  [
    "catégories principales simplifiées",
    map.includes("PRIMARY_PLACE_CATEGORIES") &&
      map.includes('["deal", "restaurant", "hotel", "activite"]'),
  ],
  [
    "catégories secondaires rangées dans Plus",
    map.includes("SECONDARY_PLACE_CATEGORIES") && map.includes("showMoreCategories"),
  ],
  [
    "recherche manuelle de la zone visible",
    map.includes("Rechercher dans cette zone") && map.includes("refreshVisibleArea"),
  ],
  [
    "compteurs GlobeLink superposés à la carte",
    map.includes("displayedPlaces.length} lieux") &&
      map.includes("displayedOfferCount") &&
      map.includes("filteredTravelers.length"),
  ],
  [
    "marqueurs avec nom aux forts zooms",
    map.includes("const showName = currentZoom >= 14") && map.includes("safeName"),
  ],
  [
    "repères pays masqués en vue ville",
    map.includes("currentZoom <= 4") && map.includes("COUNTRY_INFO.map"),
  ],
  [
    "fiche lieu en bottom sheet mobile",
    map.includes('side="bottom"') && map.includes("rounded-t-[2rem]"),
  ],
  [
    "actions itinéraire enregistrer partager",
    map.includes("Itinéraire") &&
      map.includes("Enregistrer") &&
      map.includes("Partager") &&
      map.includes("directionsUrl"),
  ],
  [
    "actions téléphone et site uniquement si disponibles",
    map.includes("placePhone") &&
      map.includes("placeWebsite") &&
      map.includes("href={`tel:${phone}`}"),
  ],
  [
    "absence de grand faux visuel quand photo indisponible",
    map.includes('placeholderClassName="mt-2 h-24 w-full sm:mt-0 sm:h-28"') &&
      !map.includes("Aucune photo vérifiée disponible pour ce lieu"),
  ],
  [
    "adresse OSM conservée côté navigateur",
    browser.includes("address:") &&
      browser.includes('tags["addr:street"]') &&
      browser.includes("phone:"),
  ],
  [
    "adresse OSM conservée côté serveur",
    publicFn.includes("address:") && publicFn.includes('tags["addr:street"]'),
  ],
  [
    "Travel Match intégré aux fiches lieux",
    map.includes("GlobeLink autour de ce lieu") && map.includes("Voir Travel Match"),
  ],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(
  `\n✓ Carte V6 Google Maps × GlobeLink : ${checks.length}/${checks.length} contrôles réussis.`,
);
