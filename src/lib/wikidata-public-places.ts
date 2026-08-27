export type WikidataPublicPlaceKind = "activity" | "restaurant" | "hotel";

export type WikidataPublicPlace = {
  id: string;
  kind: WikidataPublicPlaceKind;
  category: string;
  title: string;
  description: string | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  websiteUrl: string | null;
  sourceUrl: string;
};

type BindingValue = { value?: string };
type SparqlBinding = {
  item?: BindingValue;
  itemLabel?: BindingValue;
  itemDescription?: BindingValue;
  location?: BindingValue;
  class?: BindingValue;
  image?: BindingValue;
  website?: BindingValue;
};

type SparqlResponse = {
  results?: { bindings?: SparqlBinding[] };
};

type CacheEntry = { expires: number; rows: WikidataPublicPlace[] };

const CACHE_TTL_MS = 6 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();
const APP_IDENTITY = "GlobeLink/11.0 (+https://github.com/wassimvare/globelink)";

// Direct Wikidata classes deliberately kept small so the public query service stays fast.
// Q27686 hotel, Q11707 restaurant, Q33506 museum, Q570116 tourist attraction,
// Q22698 park, Q43501 zoo, Q194195 amusement park, Q40080 beach.
const CLASS_KIND: Record<string, { kind: WikidataPublicPlaceKind; category: string }> = {
  Q27686: { kind: "hotel", category: "hotel" },
  Q11707: { kind: "restaurant", category: "restaurant" },
  Q33506: { kind: "activity", category: "musee" },
  Q570116: { kind: "activity", category: "attraction" },
  Q22698: { kind: "activity", category: "park" },
  Q43501: { kind: "activity", category: "activite" },
  Q194195: { kind: "activity", category: "activite" },
  Q40080: { kind: "activity", category: "plage" },
};

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function entityId(value: unknown) {
  const match = String(value ?? "").match(/\/(Q\d+)$/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function httpsUrl(value: unknown): string | null {
  try {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const url = new URL(raw.replace(/^http:\/\//i, "https://"));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parsePoint(value: unknown): { latitude: number; longitude: number } | null {
  const match = String(value ?? "").match(/^Point\(([-+\d.]+)\s+([-+\d.]+)\)$/i);
  if (!match) return null;
  const longitude = finiteNumber(match[1]);
  const latitude = finiteNumber(match[2]);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function fetchWikidataPublicPlaces(input: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  limit?: number;
}): Promise<WikidataPublicPlace[]> {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return [];
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return [];

  const radiusKm = Math.max(0.5, Math.min(20, Number(input.radiusKm ?? 8)));
  const limit = Math.max(10, Math.min(120, Math.trunc(Number(input.limit ?? 60))));
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}:${radiusKm.toFixed(1)}:${limit}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.rows;

  const classes = Object.keys(CLASS_KIND)
    .map((id) => `wd:${id}`)
    .join(" ");
  const query = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?location ?class ?image ?website WHERE {
  VALUES ?class { ${classes} }
  ?item wdt:P31 ?class .
  SERVICE wikibase:around {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${longitude.toFixed(5)} ${latitude.toFixed(5)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm.toFixed(2)}" .
  }
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P856 ?website . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en" . }
}
LIMIT ${limit}
`.trim();

  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_500);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/sparql-results+json, application/json",
        "User-Agent": APP_IDENTITY,
      },
    });
    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    const json = (await response.json()) as SparqlResponse;
    const seen = new Set<string>();
    const rows = (json.results?.bindings ?? []).flatMap((binding) => {
      const id = entityId(binding.item?.value);
      const classId = entityId(binding.class?.value);
      const mapped = CLASS_KIND[classId];
      const point = parsePoint(binding.location?.value);
      const title = clean(binding.itemLabel?.value, 180);
      if (!id || !mapped || !point || !title || seen.has(id)) return [];
      seen.add(id);
      return [
        {
          id,
          kind: mapped.kind,
          category: mapped.category,
          title,
          description: clean(binding.itemDescription?.value, 620) || null,
          latitude: point.latitude,
          longitude: point.longitude,
          imageUrl: httpsUrl(binding.image?.value),
          websiteUrl: httpsUrl(binding.website?.value),
          sourceUrl: `https://www.wikidata.org/wiki/${id}`,
        } satisfies WikidataPublicPlace,
      ];
    });
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, rows });
    return rows;
  } catch (error) {
    console.warn("[GlobeLink public catalog] Wikidata unavailable", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
