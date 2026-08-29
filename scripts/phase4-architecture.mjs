import fs from "node:fs";
import path from "node:path";

const required = [
  "src/features/explorer/map-domain.ts",
  "src/features/travel/trip-domain.ts",
  "src/features/social/profile-moderation.ts",
];

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`[Phase 4] Domaine manquant: ${file}`);
}

const mapRoute = fs.readFileSync("src/routes/map.tsx", "utf8");
const tripsRoute = fs.readFileSync("src/routes/_authenticated.trips.index.tsx", "utf8");
const profileActions = fs.readFileSync("src/components/ProfileActions.tsx", "utf8");

const assertions = [
  [mapRoute.includes('@/features/explorer/map-domain'), "Explorer utilise son domaine dédié"],
  [!mapRoute.includes("type AnyPlace = {"), "Explorer ne redéfinit plus AnyPlace dans la route"],
  [!mapRoute.includes("async function fetchMapCatalog"), "Explorer ne charge plus le catalogue dans la route"],
  [tripsRoute.includes('@/features/travel/trip-domain'), "Voyage utilise son domaine dédié"],
  [!tripsRoute.includes("function formatDate("), "Voyage ne conserve plus les helpers métier dans la route"],
  [!tripsRoute.includes("function statusLabel("), "Voyage ne conserve plus les statuts métier dans la route"],
  [profileActions.includes('@/features/social/profile-moderation'), "Social sépare UI et modération"],
  [!profileActions.includes('@/integrations/supabase/client'), "ProfileActions n'accède plus directement à Supabase"],
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`[Phase 4] ${label}`);
  console.log(`✅ ${label}`);
}

const limits = [
  // Main a légitimement gagné la résolution de logos vérifiés après la Phase 4.
  // On conserve une marge très faible au-dessus de ce nouveau baseline au lieu de supprimer le garde-fou.
  ["src/routes/map.tsx", 88_500],
  ["src/routes/_authenticated.trips.index.tsx", 21_000],
  ["src/components/ProfileActions.tsx", 6_500],
];
for (const [file, max] of limits) {
  const size = fs.statSync(file).size;
  if (size > max) throw new Error(`[Phase 4] ${file} grossit trop: ${size} > ${max} octets`);
  console.log(`✅ ${file}: ${size} octets (plafond ${max})`);
}

const featureRoot = "src/features";
const forbidden = {
  explorer: ["@/features/travel", "@/features/social"],
  travel: ["@/features/explorer", "@/features/social"],
  social: ["@/features/explorer", "@/features/travel"],
};
for (const [domain, banned] of Object.entries(forbidden)) {
  const dir = path.join(featureRoot, domain);
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    const source = fs.readFileSync(path.join(dir, name), "utf8");
    for (const dependency of banned) {
      if (source.includes(dependency)) {
        throw new Error(`[Phase 4] Couplage interdit: ${domain} -> ${dependency} dans ${name}`);
      }
    }
  }
}
console.log("✅ Frontières Explorer / Voyage / Social indépendantes");
console.log("Phase 4 architecture: OK");
