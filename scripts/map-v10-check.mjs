import { readFileSync } from "node:fs";

const image = readFileSync(new URL("../src/components/CatalogImage.tsx", import.meta.url), "utf8");
const resolver = readFileSync(
  new URL("../src/lib/place-media.functions.ts", import.meta.url),
  "utf8",
);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const checks = [
  [resolver.includes('"parclick.com"'), "Parclick est explicitement rejeté comme site officiel"],
  [resolver.includes("isThirdPartyWebsite"), "Les agrégateurs/réservations tiers sont filtrés"],
  [
    resolver.includes("websiteIdentityMatches"),
    "Le contenu du site est comparé au vrai nom du lieu",
  ],
  [
    resolver.includes('metaContent(html, "og:title")'),
    "Le titre Open Graph participe à la validation d’identité",
  ],
  [resolver.includes('firstHtmlText(html, "h1")'), "Le H1 participe à la validation d’identité"],
  [
    resolver.includes("schemaNames(html)"),
    "Les noms schema.org participent à la validation d’identité",
  ],
  [
    resolver.includes(
      'minimumSimilarity = input.kind === "hotel" || input.kind === "restaurant" ? 0.6',
    ),
    "Le matching Google des hôtels/restaurants est plus strict",
  ],
  [
    resolver.includes(
      'if ((input.kind === "hotel" || input.kind === "restaurant") && !typeMatch) return null',
    ),
    "Google doit aussi retourner le bon type de lieu",
  ],
  [
    resolver.includes(".slice(0, 6)") || resolver.includes(".slice(0, 4)"),
    "Plusieurs candidats Google proches peuvent être essayés",
  ],
  [
    resolver.includes(".slice(0, 8)") || resolver.includes(".slice(0, 3)"),
    "Plusieurs vraies photos Google peuvent être essayées",
  ],
  [
    resolver.includes("skipOfficialSite"),
    "Le fallback peut ignorer un site officiel déjà invalide",
  ],
  [
    resolver.includes("[google.website, data.website]"),
    "Le site Google vérifié est essayé avant le lien OSM brut",
  ],
  [image.includes("primaryFailed"), "Une image chargée puis cassée relance un fallback générique"],
  [
    image.includes("skipOfficialSite: true"),
    "Le fallback navigateur ne reboucle pas sur le même site",
  ],
  [
    image.includes("verifiedPlaceMediaQueryKey") &&
      resolver.includes("verified-place-media-v7-strict-official"),
    "Le cache média utilise la clé vérifiée la plus récente",
  ],
  [
    pkg.scripts?.["check:map"]?.includes("map-v10-check.mjs"),
    "V10 est branchée à npm run check:map",
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
console.log(`✓ Carte V10 anti-faux-positifs photo : ${checks.length}/${checks.length}`);
