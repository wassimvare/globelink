import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function write(relativePath, source) {
  writeFileSync(resolve(root, relativePath), source, "utf8");
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[Free public catalog] Motif introuvable: ${label}`);
  return source.replace(before, after);
}

function replaceOptional(source, before, after) {
  if (source.includes(after) || !source.includes(before)) return source;
  return source.replace(before, after);
}

function patchPublicCatalog() {
  const path = "src/lib/public-travel-catalog.functions.ts";
  let source = read(path);
  const original = source;

  source = replaceRequired(
    source,
    `import { WORLD_MAP_HUBS } from "./world-map-hubs";`,
    `import { WORLD_MAP_HUBS } from "./world-map-hubs";\nimport { fetchWikidataPublicPlaces, type WikidataPublicPlace } from "./wikidata-public-places";`,
    "import Wikidata public places",
  );

  source = replaceRequired(
    source,
    `  provider: "openstreetmap-live";`,
    `  provider: "openstreetmap-live" | "wikidata-public";`,
    "public provider union",
  );

  source = replaceOptional(
    source,
    `  "https://overpass.openstreetmap.fr/api/interpreter",\n  "https://overpass.nchc.org.tw/api/interpreter",`,
    `  "https://overpass.openstreetmap.fr/api/interpreter",`,
  );

  const helperMarker = `function mapWikidataRows(`;
  if (!source.includes(helperMarker)) {
    const insertionPoint = `async function fetchWorldMapOverpass(): Promise<PublicCatalogItem[]> {`;
    if (!source.includes(insertionPoint)) throw new Error("[Free public catalog] insertion helper impossible");
    const helper = `function mapWikidataRows(\n  rows: WikidataPublicPlace[],\n  maxResults: number,\n  area?: Area,\n): PublicCatalogItem[] {\n  const fetchedAt = new Date().toISOString();\n  return rows.slice(0, maxResults).map((row) =>\n    enrichSpecializedCatalogSource({\n      id: \`wikidata-public-\${row.id.toLowerCase()}\`,\n      provider: "wikidata-public" as const,\n      external_id: row.id,\n      kind: row.kind,\n      slug: \`\${slugify(row.title)}-wikidata-\${row.id.toLowerCase()}\`,\n      title: row.title,\n      description: row.description,\n      category: row.category,\n      city: area?.city ?? null,\n      country: area?.country ?? null,\n      country_code: area?.countryCode ?? null,\n      latitude: row.latitude,\n      longitude: row.longitude,\n      image_url: row.imageUrl,\n      source_url: row.sourceUrl,\n      booking_url: row.websiteUrl,\n      price_amount: null,\n      currency: null,\n      price_text: null,\n      rating: null,\n      reviews_count: 0,\n      opening_hours: null,\n      tags: {\n        wikidata: row.id,\n        verified_real_place: true,\n        source_is_search_only: false,\n        source_strategy: "wikidata-public-v1",\n        public_api_provider: "wikidata",\n        official_website: row.websiteUrl,\n        live: true,\n      },\n      fetched_at: fetchedAt,\n      valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),\n    } satisfies PublicCatalogItem),\n  );\n}\n\n`;
    source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
  }

  const viewportBefore = `  if (unique.length) {\n    memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: unique });\n    return unique;\n  }\n  console.error("[GlobeLink viewport catalog] Overpass unavailable", lastError);\n  return [];\n}`;
  const viewportAfter = `  if (unique.length) {\n    memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: unique });\n    return unique;\n  }\n\n  // Keyless public fallback: Wikidata Query Service. This keeps hotels, restaurants\n  // and activities available even when every public Overpass mirror is saturated.\n  try {\n    const centerLat = (bounds.south + bounds.north) / 2;\n    const centerLng = (bounds.west + bounds.east) / 2;\n    const radiusKm = Math.max(2, Math.min(15, Math.ceil(Math.max(latSpan, lngSpan) * 55)));\n    const wikidataRows = mapWikidataRows(\n      await fetchWikidataPublicPlaces({\n        latitude: centerLat,\n        longitude: centerLng,\n        radiusKm,\n        limit: Math.min(120, maxResults),\n      }),\n      maxResults,\n    );\n    if (wikidataRows.length) {\n      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: wikidataRows });\n      return wikidataRows;\n    }\n  } catch (error) {\n    console.warn("[GlobeLink viewport catalog] Wikidata fallback unavailable", error);\n  }\n\n  console.error("[GlobeLink viewport catalog] Public place APIs unavailable", lastError);\n  return [];\n}`;
  source = replaceRequired(source, viewportBefore, viewportAfter, "viewport Wikidata fallback");

  const overpassBefore = `  console.error("[GlobeLink live catalog] Overpass unavailable", lastError);\n  return [];\n}`;
  const overpassAfter = `  // If Overpass is temporarily unavailable, use the fully public/keyless Wikidata\n  // endpoint instead of depending on Booking or another paid/partner API.\n  try {\n    const perArea = Math.max(15, Math.ceil(maxResults / Math.max(1, areas.length)));\n    const chunks = await Promise.allSettled(\n      areas.map(async (area) =>\n        mapWikidataRows(\n          await fetchWikidataPublicPlaces({\n            latitude: area.lat,\n            longitude: area.lng,\n            radiusKm: Math.max(2, Math.min(15, area.radius / 1000)),\n            limit: perArea,\n          }),\n          perArea,\n          area,\n        ),\n      ),\n    );\n    const fallbackRows = uniqueItems(\n      chunks.flatMap((chunk) => (chunk.status === "fulfilled" ? chunk.value : [])),\n    ).slice(0, maxResults);\n    if (fallbackRows.length) {\n      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: fallbackRows });\n      return fallbackRows;\n    }\n  } catch (error) {\n    console.warn("[GlobeLink live catalog] Wikidata fallback unavailable", error);\n  }\n\n  console.error("[GlobeLink live catalog] Public place APIs unavailable", lastError);\n  return [];\n}`;
  source = replaceRequired(source, overpassBefore, overpassAfter, "search/home Wikidata fallback");

  if (source !== original) write(path, source);
  console.log(`[Free public catalog] ${path}: ${source === original ? "déjà conforme" : "mis à jour"}`);
}

function patchLiveCatalog() {
  const path = "src/lib/live-catalog.ts";
  let source = read(path);
  const original = source;

  source = replaceRequired(
    source,
    `  if (enoughDatabaseRows)`,
    `  if (enoughDatabaseRows && !options.city && !options.country)`,
    "force public API for destination searches",
  );

  if (!source.includes("const liveSources = await Promise.allSettled([")) {
    const startMarker = `      rows = await Promise.any([`;
    const endMarker = `      ]);`;
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error("[Free public catalog] Promise.any viewport introuvable");
    const end = source.indexOf(endMarker, start);
    if (end < 0) throw new Error("[Free public catalog] fin Promise.any viewport introuvable");
    const replacement = `      const liveSources = await Promise.allSettled([\n        requireRows(\n          getViewportInternetCatalog({ data: bounds }) as Promise<unknown>,\n          "API publique OpenStreetMap/Wikidata",\n        ),\n        requireRows(\n          fetchBrowserViewportCatalog(bounds, { mode: "full" }) as Promise<unknown>,\n          "OpenStreetMap navigateur",\n        ),\n        requireRows(\n          fetchOfficialProviderCatalog({\n            data: {\n              kinds: ["activity", "hotel", "restaurant"],\n              limit: bounds.zoom >= 13 ? 120 : 80,\n              latitude: centerLatitude,\n              longitude: centerLongitude,\n              radiusMeters,\n            },\n          }) as Promise<unknown>,\n          "APIs partenaires optionnelles",\n        ),\n      ]);\n      rows = liveSources.flatMap((result) =>\n        result.status === "fulfilled" ? (result.value as LiveCatalogItem[]) : [],\n      );`;
    source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);
  }

  source = replaceRequired(
    source,
    `    "openstreetmap-browser": "OpenStreetMap (direct navigateur)",`,
    `    "openstreetmap-browser": "OpenStreetMap (direct navigateur)",\n    "wikidata-public": "Wikidata (API publique)",`,
    "Wikidata provider label",
  );

  if (source !== original) write(path, source);
  console.log(`[Free public catalog] ${path}: ${source === original ? "déjà conforme" : "mis à jour"}`);
}

patchPublicCatalog();
patchLiveCatalog();
console.log("[Free public catalog] Hôtels, restaurants et activités: OpenStreetMap/Overpass + Wikidata sans clé, partenaires seulement en complément.");
