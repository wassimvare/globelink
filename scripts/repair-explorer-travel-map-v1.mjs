import fs from "node:fs";

const file = new URL("./explorer-travel-map-v1.mjs", import.meta.url);
let source = fs.readFileSync(file, "utf8");

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

let changed = 0;
for (const [from, to] of replacements) {
  if (source.includes(from)) {
    source = source.replaceAll(from, to);
    changed += 1;
  }
}

fs.writeFileSync(file, source);
console.log(`[GlobeLink] Explorer transform repaired (${changed} replacements).`);
