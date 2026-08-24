import fs from "node:fs";
const map = fs.readFileSync(new URL("../src/routes/map.tsx", import.meta.url), "utf8");
const image = fs.readFileSync(
  new URL("../src/components/CatalogImage.tsx", import.meta.url),
  "utf8",
);
const checks = [
  ["prefetch limité à 6", map, /viewport\.zoom >= 13 \? 6/],
  ["seulement 2 workers", map, /Math\.min\(2, queue\.length\)/],
  ["préchargement temporisé", map, /}, 600\);/],
  ["anti répétition des échecs", map, /ATTEMPTED_PLACE_MEDIA/],
  ["TTL anti spam", map, /PLACE_MEDIA_ATTEMPT_TTL_MS = 10 \* 60_000/],
  ["cache Google court", image, /staleTime: 30_000/],
  ["refresh Google si image cassée", image, /activeMedia\?\.source === "google-places"/],
  ["refetch primaire", image, /refetchPrimary\(\)/],
  ["pas de double lookup au click", map, /CatalogImage performs the full lookup on open/],
];
let ok = 0;
for (const [label, source, re] of checks) {
  const hit = re.test(source);
  console.log(`${hit ? "PASS" : "FAIL"} ${label}`);
  if (hit) ok++;
}
console.log(`Carte V12 photos fiables: ${ok}/${checks.length}`);
if (ok !== checks.length) process.exit(1);
