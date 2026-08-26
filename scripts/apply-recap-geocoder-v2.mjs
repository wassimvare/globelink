import fs from "node:fs";

function patchFile(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[GlobeLink] ${path} recap geocoder v2 already applied.`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[GlobeLink] ${path} recap geocoder v2 applied.`);
}

function replaceRequired(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Recap geocoder v2 patch failed: ${label}`);
  return source.replace(needle, replacement);
}

patchFile("src/routes/_authenticated.trips.$id.tsx", (input) => {
  let source = input;

  source = replaceRequired(
    source,
    'import { getSignedMediaUrl } from "@/lib/storage";',
    'import { getSignedMediaUrl } from "@/lib/storage";\nimport { geocodePlaceLocation } from "@/lib/place-geocoding.functions";',
    "server geocoder import",
  );

  source = replaceRequired(
    source,
    '  const stats = (trip?.stats as any) ?? {};',
    `  const stats = (trip?.stats as any) ?? {};\n  const recapGeocode = useServerFn(geocodePlaceLocation);\n  const resolveRecapCoords = async (city?: string | null, country?: string | null) => {\n    const rawCity = String(city ?? "").trim();\n    const parts = rawCity.split(",").map((part) => part.trim()).filter(Boolean);\n    const normalizedCity = parts[0] || String(trip?.city ?? "").trim();\n    const normalizedCountry =\n      String(country ?? "").trim() ||\n      (parts.length > 1 ? parts[parts.length - 1] : "") ||\n      String(trip?.country ?? "").trim();\n\n    if (normalizedCity && normalizedCountry) {\n      try {\n        const result = await recapGeocode({ data: { city: normalizedCity, country: normalizedCountry } });\n        if (Number.isFinite(result?.lat) && Number.isFinite(result?.lng)) {\n          return { lat: Number(result.lat), lng: Number(result.lng) };\n        }\n      } catch {\n        // Fall back to the lightweight browser geocoder below.\n      }\n    }\n\n    return geocodeRecapLocation(normalizedCity || city, normalizedCountry || country);\n  };`,
    "recap server resolver",
  );

  source = source.replaceAll(
    "const coords = await geocodeRecapLocation(entry.city, entry.country);",
    "const coords = await resolveRecapCoords(entry.city, entry.country);",
  );
  source = source.replaceAll(
    "const fallback = await geocodeRecapLocation(trip.city, trip.country);",
    "const fallback = await resolveRecapCoords(trip.city, trip.country);",
  );

  return source;
});

patchFile("src/components/TravelJournalEnhancer.tsx", (input) => {
  let source = input;
  source = source.replaceAll(
    'const query = [city, country].filter(Boolean).join(", ").trim();',
    'const rawCity = String(city ?? "").trim();\n  const query = rawCity.split(",")[0]?.trim() || String(country ?? "").trim();',
  );
  return source;
});
