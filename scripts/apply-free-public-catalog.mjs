import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function write(path, source) {
  writeFileSync(resolve(root, path), source, "utf8");
}

function replace(source, before, after, label, required = true) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    if (required) throw new Error(`[Free public catalog] Motif introuvable: ${label}`);
    console.warn(`[Free public catalog] ${label}: variante déjà différente, patch ignoré`);
    return source;
  }
  return source.replace(before, after);
}

function patchPublicCatalog() {
  const path = "src/lib/public-travel-catalog.functions.ts";
  let source = read(path);
  const original = source;

  source = replace(
    source,
    `import { WORLD_MAP_HUBS } from "./world-map-hubs";`,
    `import { WORLD_MAP_HUBS } from "./world-map-hubs";\nimport { fetchWikidataPublicPlaces, type WikidataPublicPlace } from "./wikidata-public-places";`,
    "import Wikidata",
  );
  source = replace(
    source,
    `  provider: "openstreetmap-live";`,
    `  provider: "openstreetmap-live" | "wikidata-public";`,
    "provider public",
  );
  source = replace(
    source,
    `  "https://overpass.openstreetmap.fr/api/interpreter",\n  "https://overpass.nchc.org.tw/api/interpreter",`,
    `  "https://overpass.openstreetmap.fr/api/interpreter",`,
    "ancien miroir Overpass",
    false,
  );

  if (!source.includes("function mapWikidataRows(")) {
    const marker = `async function fetchWorldMapOverpass(): Promise<PublicCatalogItem[]> {`;
    if (!source.includes(marker)) throw new Error("[Free public catalog] helper Wikidata: insertion impossible");
    const helper = `function mapWikidataRows(\n  rows: WikidataPublicPlace[],\n  maxResults: number,\n  area?: Area,\n): PublicCatalogItem[] {\n  const fetchedAt = new Date().toISOString();\n  return rows.slice(0, maxResults).map((row) =>\n    enrichSpecializedCatalogSource({\n      id: \`wikidata-public-\${row.id.toLowerCase()}\`,\n      provider: "wikidata-public" as const,\n      external_id: row.id,\n      kind: row.kind,\n      slug: \`\${slugify(row.title)}-wikidata-\${row.id.toLowerCase()}\`,\n      title: row.title,\n      description: row.description,\n      category: row.category,\n      city: area?.city ?? null,\n      country: area?.country ?? null,\n      country_code: area?.countryCode ?? null,\n      latitude: row.latitude,\n      longitude: row.longitude,\n      image_url: row.imageUrl,\n      source_url: row.sourceUrl,\n      booking_url: row.websiteUrl,\n      price_amount: null,\n      currency: null,\n      price_text: null,\n      rating: null,\n      reviews_count: 0,\n      opening_hours: null,\n      tags: {\n        wikidata: row.id,\n        verified_real_place: true,\n        source_is_search_only: false,\n        source_strategy: "wikidata-public-v1",\n        public_api_provider: "wikidata",\n        official_website: row.websiteUrl,\n        live: true,\n      },\n      fetched_at: fetchedAt,\n      valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),\n    } satisfies PublicCatalogItem),\n  );\n}\n\n`;
    source = source.replace(marker, `${helper}${marker}`);
  }

  source = replace(
    source,
    `  if (unique.length) {\n    memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: unique });\n    return unique;\n  }\n  console.error("[GlobeLink viewport catalog] Overpass unavailable", lastError);\n  return [];\n}`,
    `  if (unique.length) {\n    memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: unique });\n    return unique;\n  }\n\n  try {\n    const centerLat = (bounds.south + bounds.north) / 2;\n    const centerLng = (bounds.west + bounds.east) / 2;\n    const radiusKm = Math.max(2, Math.min(15, Math.ceil(Math.max(latSpan, lngSpan) * 55)));\n    const wikidataRows = mapWikidataRows(\n      await fetchWikidataPublicPlaces({\n        latitude: centerLat,\n        longitude: centerLng,\n        radiusKm,\n        limit: Math.min(120, maxResults),\n      }),\n      maxResults,\n    );\n    if (wikidataRows.length) {\n      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: wikidataRows });\n      return wikidataRows;\n    }\n  } catch (error) {\n    console.warn("[GlobeLink viewport catalog] Wikidata fallback unavailable", error);\n  }\n\n  console.error("[GlobeLink viewport catalog] Public place APIs unavailable", lastError);\n  return [];\n}`,
    "fallback viewport Wikidata",
  );

  source = replace(
    source,
    `  console.error("[GlobeLink live catalog] Overpass unavailable", lastError);\n  return [];\n}`,
    `  try {\n    const perArea = Math.max(15, Math.ceil(maxResults / Math.max(1, areas.length)));\n    const chunks = await Promise.allSettled(\n      areas.map(async (area) =>\n        mapWikidataRows(\n          await fetchWikidataPublicPlaces({\n            latitude: area.lat,\n            longitude: area.lng,\n            radiusKm: Math.max(2, Math.min(15, area.radius / 1000)),\n            limit: perArea,\n          }),\n          perArea,\n          area,\n        ),\n      ),\n    );\n    const fallbackRows = uniqueItems(\n      chunks.flatMap((chunk) => (chunk.status === "fulfilled" ? chunk.value : [])),\n    ).slice(0, maxResults);\n    if (fallbackRows.length) {\n      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: fallbackRows });\n      return fallbackRows;\n    }\n  } catch (error) {\n    console.warn("[GlobeLink live catalog] Wikidata fallback unavailable", error);\n  }\n\n  console.error("[GlobeLink live catalog] Public place APIs unavailable", lastError);\n  return [];\n}`,
    "fallback recherche Wikidata",
  );

  if (source !== original) write(path, source);
  console.log(`[Free public catalog] ${path}: ${source === original ? "déjà conforme" : "mis à jour"}`);
}

function patchLiveCatalog() {
  const path = "src/lib/live-catalog.ts";
  let source = read(path);
  const original = source;

  source = replace(
    source,
    `  if (enoughDatabaseRows)`,
    `  if (enoughDatabaseRows && !options.city && !options.country)`,
    "API publique prioritaire pour les destinations",
  );

  // Older/newer V11 payloads use different viewport orchestration. If the Promise.any
  // variant is present, merge all providers so a partial Booking response cannot hide
  // free OpenStreetMap/Wikidata hotels, restaurants or activities.
  if (!source.includes("const liveSources = await Promise.allSettled([")) {
    const startMarker = `      rows = await Promise.any([`;
    const endMarker = `      ]);`;
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
    if (start >= 0 && end >= 0) {
      const replacement = `      const liveSources = await Promise.allSettled([\n        requireRows(\n          getViewportInternetCatalog({ data: bounds }) as Promise<unknown>,\n          "API publique OpenStreetMap/Wikidata",\n        ),\n        requireRows(\n          fetchBrowserViewportCatalog(bounds, { mode: "full" }) as Promise<unknown>,\n          "OpenStreetMap navigateur",\n        ),\n        requireRows(\n          fetchOfficialProviderCatalog({\n            data: {\n              kinds: ["activity", "hotel", "restaurant"],\n              limit: bounds.zoom >= 13 ? 120 : 80,\n              latitude: centerLatitude,\n              longitude: centerLongitude,\n              radiusMeters,\n            },\n          }) as Promise<unknown>,\n          "APIs partenaires optionnelles",\n        ),\n      ]);\n      rows = liveSources.flatMap((result) =>\n        result.status === "fulfilled" ? (result.value as LiveCatalogItem[]) : [],\n      );`;
      source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);
    } else {
      console.log("[Free public catalog] orchestration viewport V11 conservée; fallback public serveur actif.");
    }
  }

  source = replace(
    source,
    `    "openstreetmap-browser": "OpenStreetMap (direct navigateur)",`,
    `    "openstreetmap-browser": "OpenStreetMap (direct navigateur)",\n    "wikidata-public": "Wikidata (API publique)",`,
    "label Wikidata",
    false,
  );

  if (source !== original) write(path, source);
  console.log(`[Free public catalog] ${path}: ${source === original ? "déjà conforme" : "mis à jour"}`);
}

patchPublicCatalog();
patchLiveCatalog();
console.log("[Free public catalog] Hôtels, restaurants et activités: OpenStreetMap/Overpass + Wikidata sans clé; Booking n'est plus requis pour obtenir des lieux.");
