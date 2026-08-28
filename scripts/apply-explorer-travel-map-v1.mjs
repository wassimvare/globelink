import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const template = new URL("./explorer-travel-map-v1.template.txt", import.meta.url);
const runtime = new URL(`./.explorer-travel-map-v1.runtime-${process.pid}.mjs`, import.meta.url);
let source = fs.readFileSync(template, "utf8");

const replacements = [
  [
    'label: countryQuery.trim() ? `près de ${countryQuery.trim()}` : "dans cette zone",',
    'label: countryQuery.trim() ? "près de " + countryQuery.trim() : "dans cette zone",',
  ],
  [
    '{distanceKm < 1 ? `${Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)} m` : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`}',
    '{distanceKm < 1 ? String(Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)) + " m" : distanceKm.toFixed(distanceKm < 10 ? 1 : 0) + " km"}',
  ],
  [
    '`Ajouté depuis Explorer · ${place.provider || "GlobeLink"}`',
    '"Ajouté depuis Explorer · " + (place.provider || "GlobeLink")',
  ],
  [
    'place.source_url ? `Source : ${place.source_url}` : null',
    'place.source_url ? "Source : " + place.source_url : null',
  ],
  [
    'toast.success(`Ajouté à ${trip.title}`);',
    'toast.success("Ajouté à " + trip.title);',
  ],
  [
    '{trip.starts_on ? ` · dès le ${new Date(`${trip.starts_on}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}',
    '{trip.starts_on ? " · dès le " + new Date(trip.starts_on + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}',
  ],
];

let repaired = 0;
for (const [from, to] of replacements) {
  if (!source.includes(from)) continue;
  source = source.replaceAll(from, to);
  repaired += 1;
}

if (repaired !== replacements.length) {
  console.error(
    `[Explorer pipeline] Template inattendu: ${repaired}/${replacements.length} corrections appliquées.`,
  );
  process.exit(1);
}

try {
  fs.writeFileSync(runtime, source, "utf8");
  const result = spawnSync(process.execPath, [fileURLToPath(runtime)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status || 1);
} finally {
  fs.rmSync(runtime, { force: true });
}

console.log("[Explorer pipeline] Template exécuté sans réécrire les scripts du dépôt.");
