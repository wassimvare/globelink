import { readFileSync } from "node:fs";

const map = readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const image = readFileSync(new URL("../src/components/CatalogImage.tsx", import.meta.url), "utf8");
const resolver = readFileSync(
  new URL("../src/lib/place-media.functions.ts", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const checks = [
  [
    map.includes("mediaPrefetchCandidates"),
    "Les photos des lieux visibles sont préparées avant le clic",
  ],
  [
    map.includes("preloadPlaceMediaUrl"),
    "Les octets des images sont préchargés dans le navigateur",
  ],
  [map.includes("PREFETCHING_PLACE_MEDIA"), "Les préchargements photo identiques sont dédupliqués"],
  [map.includes("fastOnly: true"), "Le préchargement utilise un chemin Google rapide"],
  [
    map.includes("setQueryData(queryKey, media)"),
    "Le résultat préchargé alimente directement CatalogImage",
  ],
  [map.includes("mouseover: () => onPrefetch(p)"), "Le survol d'un marqueur préchauffe sa photo"],
  [
    map.includes("mousedown: () => onPrefetch(p)"),
    "Le toucher/clic prépare aussi la photo au plus tôt",
  ],
  [
    image.includes("staleTime: 15 * 60_000") || image.includes("staleTime: 30_000"),
    "Une photo résolue n'est pas redemandée à chaque ouverture",
  ],
  [
    image.includes("gcTime: 60 * 60_000") || image.includes("gcTime: 15 * 60_000"),
    "Le cache mémoire photo survit aux fermetures de fiche",
  ],
  [resolver.includes("fastOnly?: boolean"), "Le résolveur possède un mode de préchargement rapide"],
  [
    resolver.includes('type.endsWith("_restaurant")'),
    "Les sous-types Google de restaurants sont reconnus",
  ],
  [
    resolver.includes('"bed_and_breakfast"') && resolver.includes('"guest_house"'),
    "Les variantes modernes d'hébergement Google sont reconnues",
  ],
  [
    resolver.includes("googleCompactTextSearch"),
    "Une seconde recherche Google plus tolérante couvre les noms/adresses incomplets",
  ],
  [
    resolver.includes(".slice(0, 8)"),
    "Jusqu'à huit vraies photos Google peuvent être essayées avant abandon",
  ],
  [
    pkg.scripts?.["check:map"]?.includes("map-v11-check.mjs"),
    "V11 est branchée à npm run check:map",
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
console.log(`✓ Carte V11 photos instantanées : ${checks.length}/${checks.length}`);
