import { enrichSpecializedCatalogSource } from "./catalog-source-routing";

export type BrowserViewportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
};

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export type BrowserViewportCatalogItem = {
  id: string;
  provider: "openstreetmap-browser";
  external_id: string;
  kind: "activity" | "restaurant" | "hotel";
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  source_url: string;
  booking_url: string | null;
  price_amount: number | null;
  currency: string | null;
  price_text: string | null;
  rating: number | null;
  reviews_count: number;
  opening_hours: string | null;
  tags: Record<string, unknown> | null;
  fetched_at: string;
  valid_until: string | null;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const browserCache = new Map<string, { expires: number; rows: BrowserViewportCatalogItem[] }>();
const CACHE_TTL = 15 * 60_000;

function clean(value: unknown, max = 180) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "lieu"
  );
}

function safeHttps(value?: string) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function classify(tags: Record<string, string>) {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const natural = tags.natural;
  const shop = tags.shop;
  if (["restaurant", "cafe", "fast_food", "food_court", "ice_cream"].includes(amenity))
    return { kind: "restaurant" as const, category: "restaurant" };
  if (
    ["hotel", "hostel", "guest_house", "motel", "resort", "apartment", "camp_site"].includes(
      tourism,
    )
  )
    return { kind: "hotel" as const, category: "hotel" };
  if (["museum", "gallery"].includes(tourism))
    return { kind: "activity" as const, category: "musee" };
  if (["attraction", "theme_park", "zoo", "aquarium", "viewpoint", "artwork"].includes(tourism))
    return { kind: "activity" as const, category: "activite" };
  if (
    [
      "park",
      "nature_reserve",
      "water_park",
      "sports_centre",
      "bowling_alley",
      "marina",
      "horse_riding",
      "escape_game",
      "fitness_centre",
    ].includes(leisure)
  )
    return { kind: "activity" as const, category: "activite" };
  if (["cinema", "theatre", "arts_centre", "events_venue"].includes(amenity))
    return {
      kind: "activity" as const,
      category: amenity === "events_venue" ? "event" : "activite",
    };
  if (["beach", "waterfall"].includes(natural))
    return { kind: "activity" as const, category: natural === "beach" ? "plage" : "cascade" };
  if (["mall", "department_store"].includes(shop))
    return { kind: "activity" as const, category: "shopping" };
  return null;
}

function buildQuery(bounds: BrowserViewportBounds, mode: "fast" | "full") {
  const { south, west, north, east } = bounds;
  const bbox = `(${south.toFixed(5)},${west.toFixed(5)},${north.toFixed(5)},${east.toFixed(5)})`;
  // The fast pass intentionally asks only for nodes. In dense cities this returns
  // useful markers much sooner than a full nwr (nodes/ways/relations) scan. The
  // full pass runs afterwards and enriches the same viewport in the background.
  const selectorType = mode === "fast" ? "node" : "nwr";
  const selectors = [
    `${selectorType}["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream|cinema|theatre|arts_centre|events_venue)$"]["name"]${bbox};`,
    `${selectorType}["tourism"~"^(hotel|hostel|guest_house|motel|resort|apartment|camp_site|attraction|theme_park|zoo|aquarium|viewpoint|museum|gallery|artwork)$"]["name"]${bbox};`,
    `${selectorType}["leisure"~"^(park|nature_reserve|water_park|sports_centre|bowling_alley|marina|horse_riding|escape_game|fitness_centre)$"]["name"]${bbox};`,
    `${selectorType}["natural"~"^(beach|waterfall)$"]["name"]${bbox};`,
    `${selectorType}["shop"~"^(mall|department_store)$"]["name"]${bbox};`,
  ];
  const limit =
    mode === "fast"
      ? bounds.zoom >= 13
        ? 220
        : 160
      : bounds.zoom >= 13
        ? 500
        : bounds.zoom >= 10
          ? 350
          : 220;
  const timeout = mode === "fast" ? 7 : 16;
  return `[out:json][timeout:${timeout}];(${selectors.join("\n")});out center ${limit};`;
}

function mapRows(elements: OsmElement[], maxRows: number): BrowserViewportCatalogItem[] {
  const now = new Date();
  const fetchedAt = now.toISOString();
  const validUntil = new Date(now.getTime() + CACHE_TTL).toISOString();
  const seen = new Set<string>();
  const rows: BrowserViewportCatalogItem[] = [];
  for (const element of elements) {
    const tags = element.tags ?? {};
    const mapped = classify(tags);
    const title = clean(tags["name:fr"] || tags.name || tags["name:en"]);
    const latitude = Number(element.lat ?? element.center?.lat);
    const longitude = Number(element.lon ?? element.center?.lon);
    if (!mapped || !title || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const externalId = `${element.type}/${element.id}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    const website = safeHttps(tags.website || tags["contact:website"]);
    rows.push(
      enrichSpecializedCatalogSource({
        id: `osm-browser-${element.type}-${element.id}`,
        provider: "openstreetmap-browser",
        external_id: externalId,
        kind: mapped.kind,
        slug: `${slugify(title)}-osm-${element.type}-${element.id}`,
        title,
        description: clean(tags["description:fr"] || tags.description || tags.note, 620) || null,
        category: mapped.category,
        city: clean(tags["addr:city"] || tags["addr:town"] || tags["addr:village"], 100) || null,
        country: null,
        country_code: clean(tags["addr:country"], 2).toUpperCase() || null,
        latitude,
        longitude,
        image_url: safeHttps(tags.image),
        source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        booking_url: website,
        price_amount: null,
        currency: null,
        price_text: tags.fee === "no" ? "Gratuit" : null,
        rating: null,
        reviews_count: 0,
        opening_hours: clean(tags.opening_hours, 220) || null,
        tags: {
          amenity: tags.amenity ?? null,
          tourism: tags.tourism ?? null,
          leisure: tags.leisure ?? null,
          natural: tags.natural ?? null,
          shop: tags.shop ?? null,
          cuisine: tags.cuisine ?? null,
          phone: clean(tags.phone || tags["contact:phone"], 80) || null,
          address:
            [
              clean(tags["addr:housenumber"], 24),
              clean(tags["addr:street"], 120),
              clean(tags["addr:postcode"], 24),
              clean(tags["addr:city"] || tags["addr:town"] || tags["addr:village"], 100),
            ]
              .filter(Boolean)
              .join(" ") || null,
          image: safeHttps(tags.image),
          wikimedia_commons: clean(tags.wikimedia_commons, 240) || null,
          wikidata: clean(tags.wikidata, 40) || null,
          wikipedia: clean(tags.wikipedia, 200) || null,
          website,
          browser_fallback: true,
        },
        fetched_at: fetchedAt,
        valid_until: validUntil,
      }),
    );
    if (rows.length >= maxRows) break;
  }
  return rows;
}

export async function fetchBrowserViewportCatalog(
  bounds: BrowserViewportBounds,
  options: { mode?: "fast" | "full" } = {},
): Promise<BrowserViewportCatalogItem[]> {
  if (typeof window === "undefined" || bounds.zoom < 7) return [];
  const mode = options.mode ?? "full";
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  // Direct browser fallback is intentionally limited to city/metro views.
  if (latSpan > 3.2 || lngSpan > 4.5) return [];
  const key = `${mode}:${bounds.south.toFixed(3)}:${bounds.west.toFixed(3)}:${bounds.north.toFixed(3)}:${bounds.east.toFixed(3)}:${Math.round(bounds.zoom)}`;
  const cached = browserCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.rows;

  const query = buildQuery(bounds, mode);
  const maxRows =
    mode === "fast"
      ? bounds.zoom >= 13
        ? 220
        : 160
      : bounds.zoom >= 13
        ? 500
        : bounds.zoom >= 10
          ? 350
          : 220;
  const timeoutMs = mode === "fast" ? 3_500 : 12_000;
  const endpoints = mode === "fast" ? ENDPOINTS.slice(0, 1) : ENDPOINTS;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Keep this a simple POST with no custom headers so CORS preflight cannot
      // become the slowest part of the first-wave map request.
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) continue;
      const json = (await response.json()) as { elements?: OsmElement[] };
      const rows = mapRows(json.elements ?? [], maxRows);
      if (rows.length) {
        browserCache.set(key, { expires: Date.now() + CACHE_TTL, rows });
        return rows;
      }
    } catch {
      // Try the next public mirror.
    } finally {
      window.clearTimeout(timeout);
    }
  }
  return [];
}
