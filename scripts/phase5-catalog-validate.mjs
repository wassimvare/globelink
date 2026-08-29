import fs from "node:fs";

const quality = fs.readFileSync("src/lib/catalog-quality.ts", "utf8");
const live = fs.readFileSync("src/lib/live-catalog.ts", "utf8");
const reliability = fs.readFileSync("src/lib/catalog-reliability.ts", "utf8");
const image = fs.readFileSync("src/components/CatalogImage.tsx", "utf8");

const checks = [
  [quality.includes("catalogItemPassesPhase5"), "Quality gate Phase 5 présent"],
  [quality.includes("isExpired"), "Inventaire expiré rejeté"],
  [quality.includes("catalogItemsDescribeSamePlace"), "Déduplication multi-fournisseurs présente"],
  [quality.includes("qualityScore"), "Priorité donnée aux fournisseurs les plus fiables"],
  [quality.includes("trustedDirectCatalogImage"), "Images directes filtrées par source vérifiée"],
  [live.includes("dedupeVerifiedCatalogItems"), "Catalogue live utilise le quality gate"],
  [reliability.includes("BLOCKED_GENERIC_IMAGE_HOSTS"), "Images génériques/stock bloquées"],
  [reliability.includes("0,0 is a common upstream fallback"), "Coordonnées 0,0 rejetées"],
  [image.includes("Photo officielle indisponible"), "Absence de photo n'invente pas d'image"],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "✅" : "❌"} ${label}`);
  if (!ok) failed += 1;
}
console.log(`\nPhase 5 catalogue: ${checks.length - failed}/${checks.length} contrôles réussis.`);
if (failed) process.exit(1);
