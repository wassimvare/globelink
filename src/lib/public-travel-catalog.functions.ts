import { createServerFn } from "@tanstack/react-start";
import { enrichSpecializedCatalogSource } from "./catalog-source-routing";
import { WORLD_MAP_HUBS } from "./world-map-hubs";
import { fetchWikidataPublicPlaces, type WikidataPublicPlace } from "./wikidata-public-places";

export type PublicCatalogKind = "activity" | "restaurant" | "hotel";
type PublicCatalogJson =
  string | number | boolean | null | PublicCatalogJson[] | { [key: string]: PublicCatalogJson };

export type PublicCatalogItem = {
  id: string;
  provider: "openstreetmap-live" | "wikidata-public";
  external_id: string;
  kind: PublicCatalogKind;
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
  tags: Record<string, PublicCatalogJson> | null;
  fetched_at: string;
  valid_until: string | null;
};

type Area = {
  city: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  radius: number;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string>;
};

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const APP_IDENTITY = "GlobeLink/10.0 (+https://github.com/wassimvare/globelink)";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  // NCHC retiré : ce miroir ne résout plus de façon fiable en production Vercel.
];
const CACHE_TTL = 6 * 60 * 60_000;
const SEARCH_CACHE_TTL = 24 * 60 * 60_000;
const memoryCache = new Map<string, { expires: number; value: PublicCatalogItem[] }>();
const geocodeCache = new Map<string, { expires: number; value: Area | null }>();
let lastNominatimRequest = 0;

const LOCATION_HINTS: Record<string, string> = {
  france: "Paris, France",
  japon: "Tokyo, Japon",
  indonesie: "Ubud, Bali, Indonésie",
  italie: "Rome, Italie",
  thailande: "Bangkok, Thaïlande",
  "etats-unis": "New York, États-Unis",
  espagne: "Barcelone, Espagne",
  portugal: "Lisbonne, Portugal",
  mexique: "Mexico, Mexique",
  grece: "Athènes, Grèce",
  maroc: "Marrakech, Maroc",
  islande: "Reykjavik, Islande",
  turquie: "Istanbul, Turquie",
  canada: "Montréal, Canada",
  perou: "Lima, Pérou",
  bresil: "Rio de Janeiro, Brésil",
  vietnam: "Hanoï, Vietnam",
  malaisie: "Kuala Lumpur, Malaisie",
  singapour: "Singapour",
  australie: "Sydney, Australie",
  "royaume-uni": "Londres, Royaume-Uni",
};

const HUBS: Area[] = [
  { city: "Lyon", country: "France", countryCode: "FR", lat: 45.764, lng: 4.8357, radius: 6500 },
  { city: "Paris", country: "France", countryCode: "FR", lat: 48.8566, lng: 2.3522, radius: 6500 },
  {
    city: "Lisbonne",
    country: "Portugal",
    countryCode: "PT",
    lat: 38.7223,
    lng: -9.1393,
    radius: 6000,
  },
  {
    city: "Barcelone",
    country: "Espagne",
    countryCode: "ES",
    lat: 41.3874,
    lng: 2.1686,
    radius: 6000,
  },
  { city: "Rome", country: "Italie", countryCode: "IT", lat: 41.9028, lng: 12.4964, radius: 6000 },
  {
    city: "Marrakech",
    country: "Maroc",
    countryCode: "MA",
    lat: 31.6295,
    lng: -7.9811,
    radius: 6500,
  },
  {
    city: "Istanbul",
    country: "Turquie",
    countryCode: "TR",
    lat: 41.0082,
    lng: 28.9784,
    radius: 6500,
  },
  {
    city: "Ubud",
    country: "Indonésie",
    countryCode: "ID",
    lat: -8.5069,
    lng: 115.2625,
    radius: 7000,
  },
  { city: "Tokyo", country: "Japon", countryCode: "JP", lat: 35.6762, lng: 139.6503, radius: 6000 },
  {
    city: "Bangkok",
    country: "Thaïlande",
    countryCode: "TH",
    lat: 13.7563,
    lng: 100.5018,
    radius: 6500,
  },
  {
    city: "New York",
    country: "États-Unis",
    countryCode: "US",
    lat: 40.7128,
    lng: -74.006,
    radius: 6500,
  },
  {
    city: "Montréal",
    country: "Canada",
    countryCode: "CA",
    lat: 45.5019,
    lng: -73.5674,
    radius: 6500,
  },
  {
    city: "Londres",
    country: "Royaume-Uni",
    countryCode: "GB",
    lat: 51.5072,
    lng: -0.1276,
    radius: 7000,
  },
  {
    city: "Amsterdam",
    country: "Pays-Bas",
    countryCode: "NL",
    lat: 52.3676,
    lng: 4.9041,
    radius: 6500,
  },
  {
    city: "Berlin",
    country: "Allemagne",
    countryCode: "DE",
    lat: 52.52,
    lng: 13.405,
    radius: 7000,
  },
  {
    city: "Athènes",
    country: "Grèce",
    countryCode: "GR",
    lat: 37.9838,
    lng: 23.7275,
    radius: 6500,
  },
  {
    city: "Dubaï",
    country: "Émirats Arabes Unis",
    countryCode: "AE",
    lat: 25.2048,
    lng: 55.2708,
    radius: 8000,
  },
  {
    city: "Le Caire",
    country: "Égypte",
    countryCode: "EG",
    lat: 30.0444,
    lng: 31.2357,
    radius: 7500,
  },
  {
    city: "Cape Town",
    country: "Afrique du Sud",
    countryCode: "ZA",
    lat: -33.9249,
    lng: 18.4241,
    radius: 8000,
  },
  {
    city: "Nairobi",
    country: "Kenya",
    countryCode: "KE",
    lat: -1.2864,
    lng: 36.8172,
    radius: 7500,
  },
  {
    city: "Doha",
    country: "Qatar",
    countryCode: "QA",
    lat: 25.2854,
    lng: 51.531,
    radius: 7000,
  },
  {
    city: "Séoul",
    country: "Corée du Sud",
    countryCode: "KR",
    lat: 37.5665,
    lng: 126.978,
    radius: 7000,
  },
  {
    city: "Hong Kong",
    country: "Hong Kong",
    countryCode: "HK",
    lat: 22.3193,
    lng: 114.1694,
    radius: 7000,
  },
  {
    city: "Hanoï",
    country: "Vietnam",
    countryCode: "VN",
    lat: 21.0278,
    lng: 105.8342,
    radius: 7000,
  },
  {
    city: "Manille",
    country: "Philippines",
    countryCode: "PH",
    lat: 14.5995,
    lng: 120.9842,
    radius: 7500,
  },
  {
    city: "Sydney",
    country: "Australie",
    countryCode: "AU",
    lat: -33.8688,
    lng: 151.2093,
    radius: 8000,
  },
  {
    city: "Auckland",
    country: "Nouvelle-Zélande",
    countryCode: "NZ",
    lat: -36.8509,
    lng: 174.7645,
    radius: 7500,
  },
  {
    city: "Buenos Aires",
    country: "Argentine",
    countryCode: "AR",
    lat: -34.6037,
    lng: -58.3816,
    radius: 8000,
  },
  {
    city: "Rio de Janeiro",
    country: "Brésil",
    countryCode: "BR",
    lat: -22.9068,
    lng: -43.1729,
    radius: 8000,
  },
  {
    city: "Lima",
    country: "Pérou",
    countryCode: "PE",
    lat: -12.0464,
    lng: -77.0428,
    radius: 7500,
  },
  {
    city: "Mexico",
    country: "Mexique",
    countryCode: "MX",
    lat: 19.4326,
    lng: -99.1332,
    radius: 8000,
  },
  {
    city: "Los Angeles",
    country: "États-Unis",
    countryCode: "US",
    lat: 34.0522,
    lng: -118.2437,
    radius: 8000,
  },
  {
    city: "Miami",
    country: "États-Unis",
    countryCode: "US",
    lat: 25.7617,
    lng: -80.1918,
    radius: 7500,
  },
  {
    city: "Vancouver",
    country: "Canada",
    countryCode: "CA",
    lat: 49.2827,
    lng: -123.1207,
    radius: 7500,
  },
];

function clean(value: unknown, max: number) {
  return (
    String(value ?? "")
      .normalize("NFKC")
      // eslint-disable-next-line no-control-regex -- non-printable upstream text is intentionally removed
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value: string) {
  return (
    normalize(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "lieu"
  );
}

function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dailyIndex(salt = 0) {
  const day = Math.floor(Date.now() / 86_400_000);
  return Math.abs(day + salt) % HUBS.length;
}

function dailyAreas(count: number): Area[] {
  const result: Area[] = [];
  const start = dailyIndex();
  const stride = coprimeStride(HUBS.length);
  for (let index = 0; index < HUBS.length * 2 && result.length < count; index += 1) {
    const hub = HUBS[(start + index * stride) % HUBS.length];
    if (!result.some((area) => area.city === hub.city)) result.push(hub);
  }
  return result;
}

function coprimeStride(length: number) {
  for (const candidate of [7, 11, 13, 17, 19, 23, 5, 3]) {
    if (length % candidate !== 0) return candidate;
  }
  return 1;
}

function uniqueItems(items: PublicCatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.provider}:${item.external_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapWikidataRows(
  rows: WikidataPublicPlace[],
  maxResults: number,
  area?: Area,
): PublicCatalogItem[] {
  const fetchedAt = new Date().toISOString();
  return rows.slice(0, maxResults).map((row) =>
    enrichSpecializedCatalogSource({
      id: `wikidata-public-${row.id.toLowerCase()}`,
      provider: "wikidata-public" as const,
      external_id: row.id,
      kind: row.kind,
      slug: `${slugify(row.title)}-wikidata-${row.id.toLowerCase()}`,
      title: row.title,
      description: row.description,
      category: row.category,
      city: area?.city ?? null,
      country: area?.country ?? null,
      country_code: area?.countryCode ?? null,
      latitude: row.latitude,
      longitude: row.longitude,
      image_url: row.imageUrl,
      source_url: row.sourceUrl,
      booking_url: row.websiteUrl,
      price_amount: null,
      currency: null,
      price_text: null,
      rating: null,
      reviews_count: 0,
      opening_hours: null,
      tags: {
        wikidata: row.id,
        verified_real_place: true,
        source_is_search_only: false,
        source_strategy: "wikidata-public-v1",
        public_api_provider: "wikidata",
        official_website: row.websiteUrl,
        live: true,
      },
      fetched_at: fetchedAt,
      valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),
    } satisfies PublicCatalogItem),
  );
}

async function fetchWorldMapOverpass(): Promise<PublicCatalogItem[]> {
  const areas = dailyAreas(18);
  const batches: Area[][] = [];
  for (let index = 0; index < areas.length; index += 3) batches.push(areas.slice(index, index + 3));

  const rows: PublicCatalogItem[] = [];
  for (const batch of batches) {
    rows.push(...(await fetchOverpass(batch, 75)));
  }
  return uniqueItems(rows).slice(0, 420);
}

function mapKind(
  tags: Record<string, string>,
): { kind: PublicCatalogKind; category: string } | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const natural = tags.natural;
  const shop = tags.shop;

  if (["restaurant", "cafe", "fast_food", "food_court", "ice_cream"].includes(amenity))
    return { kind: "restaurant", category: "restaurant" };
  if (
    ["hotel", "hostel", "guest_house", "motel", "resort", "apartment", "camp_site"].includes(
      tourism,
    )
  )
    return { kind: "hotel", category: "hotel" };
  if (["museum", "gallery"].includes(tourism)) return { kind: "activity", category: "musee" };
  if (["attraction", "theme_park", "zoo", "aquarium", "viewpoint", "artwork"].includes(tourism))
    return { kind: "activity", category: "activite" };
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
    return { kind: "activity", category: "activite" };
  if (["cinema", "theatre", "arts_centre", "events_venue"].includes(amenity))
    return {
      kind: "activity",
      category: amenity === "events_venue" ? "event" : "activite",
    };
  if (["beach", "waterfall"].includes(natural))
    return { kind: "activity", category: natural === "beach" ? "plage" : "cascade" };
  if (["mall", "department_store"].includes(shop))
    return { kind: "activity", category: "shopping" };
  return null;
}

function description(tags: Record<string, string>, kind: PublicCatalogKind): string | null {
  const direct = clean(tags["description:fr"] || tags.description || tags.note, 620);
  if (direct) return direct;
  const parts: string[] = [];
  if (kind === "restaurant" && tags.cuisine)
    parts.push(`Cuisine : ${tags.cuisine.replace(/;/g, ", ")}`);
  if (tags.opening_hours) parts.push(`Horaires : ${tags.opening_hours}`);
  if (tags.wheelchair) parts.push(`Accès PMR : ${tags.wheelchair}`);
  if (tags.outdoor_seating === "yes") parts.push("Terrasse disponible");
  return parts.length ? parts.join(" · ").slice(0, 620) : null;
}

function buildOverpassQuery(areas: Area[], maxResults: number) {
  const filters = areas.flatMap((area) => {
    const around = `(around:${area.radius},${area.lat},${area.lng})`;
    return [
      `nwr${around}["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream|cinema|theatre|arts_centre|events_venue)$"]["name"];`,
      `nwr${around}["tourism"~"^(hotel|hostel|guest_house|motel|resort|apartment|camp_site|attraction|theme_park|zoo|aquarium|viewpoint|museum|gallery|artwork)$"]["name"];`,
      `nwr${around}["leisure"~"^(park|nature_reserve|water_park|sports_centre|bowling_alley|marina|horse_riding|escape_game|fitness_centre)$"]["name"];`,
      `nwr${around}["natural"~"^(beach|waterfall)$"]["name"];`,
      `nwr${around}["shop"~"^(mall|department_store)$"]["name"];`,
    ];
  });
  return `[out:json][timeout:25];(${filters.join("\n")});out center ${Math.min(300, Math.max(20, maxResults))};`;
}

function buildViewportOverpassQuery(
  bounds: { south: number; west: number; north: number; east: number },
  maxResults: number,
) {
  const bbox = `(${bounds.south},${bounds.west},${bounds.north},${bounds.east})`;
  const filters = viewportFilters(bbox);
  return `[out:json][timeout:18];(${filters.join("\n")});out center ${Math.min(420, Math.max(40, maxResults))};`;
}

function viewportFilters(selector: string) {
  return [
    `nwr${selector}["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream|cinema|theatre|arts_centre|events_venue)$"]["name"];`,
    `nwr${selector}["tourism"~"^(hotel|hostel|guest_house|motel|resort|apartment|camp_site|attraction|theme_park|zoo|aquarium|viewpoint|museum|gallery|artwork)$"]["name"];`,
    `nwr${selector}["leisure"~"^(park|nature_reserve|water_park|sports_centre|bowling_alley|marina|horse_riding|escape_game|fitness_centre)$"]["name"];`,
    `nwr${selector}["natural"~"^(beach|waterfall)$"]["name"];`,
    `nwr${selector}["shop"~"^(mall|department_store)$"]["name"];`,
  ];
}

function buildAroundOverpassQuery(
  lat: number,
  lng: number,
  radiusMeters: number,
  maxResults: number,
) {
  const selector = `(around:${Math.round(radiusMeters)},${lat.toFixed(5)},${lng.toFixed(5)})`;
  const filters = viewportFilters(selector);
  return `[out:json][timeout:14];(${filters.join("\n")});out center ${Math.min(180, Math.max(25, maxResults))};`;
}

function mapOverpassRows(
  json: { elements?: OverpassElement[] },
  maxResults: number,
): PublicCatalogItem[] {
  const fetchedAt = new Date().toISOString();
  const seen = new Set<string>();
  return (json.elements ?? [])
    .flatMap((element) => {
      const tags = element.tags ?? {};
      const mapped = mapKind(tags);
      const title = clean(tags["name:fr"] || tags.name || tags["name:en"], 180);
      const latitude = numberOrNull(element.lat ?? element.center?.lat);
      const longitude = numberOrNull(element.lon ?? element.center?.lon);
      if (!mapped || !title || latitude == null || longitude == null) return [];
      const externalId = `${element.type}/${element.id}`;
      if (seen.has(externalId)) return [];
      seen.add(externalId);
      const website = safeHttps(tags.website || tags["contact:website"]);
      const image =
        safeHttps(tags.image) ||
        (tags.wikimedia_commons?.startsWith("https://") ? safeHttps(tags.wikimedia_commons) : null);
      const city = clean(tags["addr:city"] || tags["addr:town"] || tags["addr:village"], 100);
      const countryCode = clean(tags["addr:country"], 2).toUpperCase();
      return [
        enrichSpecializedCatalogSource({
          id: `osm-live-${element.type}-${element.id}`,
          provider: "openstreetmap-live" as const,
          external_id: externalId,
          kind: mapped.kind,
          slug: `${slugify(title)}-osm-${element.type}-${element.id}`,
          title,
          description: description(tags, mapped.kind),
          category: mapped.category,
          city: city || null,
          country: null,
          country_code: countryCode || null,
          latitude,
          longitude,
          image_url: image,
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
            website,
            image: safeHttps(tags.image),
            wikimedia_commons: clean(tags.wikimedia_commons, 240) || null,
            wikidata: clean(tags.wikidata, 40) || null,
            wikipedia: clean(tags.wikipedia, 200) || null,
            live: true,
            viewport: true,
          },
          fetched_at: fetchedAt,
          valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),
        } satisfies PublicCatalogItem),
      ];
    })
    .slice(0, maxResults);
}

async function requestOverpass(query: string, maxResults: number): Promise<PublicCatalogItem[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 19_000);
    try {
      // POST is preferred. Some public mirrors occasionally reject POST from
      // particular networks, so a GET retry is used before moving to the next mirror.
      let response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": APP_IDENTITY,
          "Accept-Language": "fr,en;q=0.8",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok && [400, 403, 405, 429, 502, 503, 504].includes(response.status)) {
        const url = new URL(endpoint);
        url.searchParams.set("data", query);
        response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { "User-Agent": APP_IDENTITY, "Accept-Language": "fr,en;q=0.8" },
        });
      }
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const json = (await response.json()) as { elements?: OverpassElement[] };
      return mapOverpassRows(json, maxResults);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass indisponible");
}

function sampledViewportPoints(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}) {
  const midLat = (bounds.south + bounds.north) / 2;
  const midLng = (bounds.west + bounds.east) / 2;
  const latInset = (bounds.north - bounds.south) * 0.23;
  const lngInset = (bounds.east - bounds.west) * 0.23;
  return [
    [midLat, midLng],
    [midLat + latInset, midLng - lngInset],
    [midLat + latInset, midLng + lngInset],
    [midLat - latInset, midLng - lngInset],
    [midLat - latInset, midLng + lngInset],
  ] as Array<[number, number]>;
}

async function fetchViewportOverpass(
  bounds: { south: number; west: number; north: number; east: number },
  maxResults: number,
  zoom = 10,
): Promise<PublicCatalogItem[]> {
  const key = `viewport:v3:${bounds.south.toFixed(3)}:${bounds.west.toFixed(3)}:${bounds.north.toFixed(3)}:${bounds.east.toFixed(3)}:${zoom}:${maxResults}`;
  const cached = memoryCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  let rows: PublicCatalogItem[] = [];
  let lastError: unknown;

  try {
    // City/neighbourhood view: the bbox is small enough to query directly.
    if (zoom >= 10 || (latSpan <= 1.8 && lngSpan <= 2.4)) {
      rows = await requestOverpass(buildViewportOverpassQuery(bounds, maxResults), maxResults);
    } else {
      // Regional view: a huge bbox makes public Overpass instances time out.
      // Sample five smaller circles across the viewport instead. This gives an
      // immediately populated map, then finer data replaces it as the user zooms.
      const radius = zoom <= 5 ? 24_000 : zoom === 6 ? 18_000 : zoom === 7 ? 12_000 : 8_000;
      const perPoint = Math.max(30, Math.ceil(maxResults / 5));
      const chunks = await Promise.allSettled(
        sampledViewportPoints(bounds).map(([lat, lng]) =>
          requestOverpass(buildAroundOverpassQuery(lat, lng, radius, perPoint), perPoint),
        ),
      );
      rows = chunks.flatMap((chunk) => (chunk.status === "fulfilled" ? chunk.value : []));
      const rejected = chunks.find((chunk) => chunk.status === "rejected");
      if (!rows.length && rejected?.status === "rejected") lastError = rejected.reason;
    }
  } catch (error) {
    lastError = error;
  }

  const unique = rows
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.external_id === item.external_id) === index,
    )
    .slice(0, maxResults);

  if (unique.length) {
    memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: unique });
    return unique;
  }

  try {
    const centerLat = (bounds.south + bounds.north) / 2;
    const centerLng = (bounds.west + bounds.east) / 2;
    const radiusKm = Math.max(2, Math.min(15, Math.ceil(Math.max(latSpan, lngSpan) * 55)));
    const wikidataRows = mapWikidataRows(
      await fetchWikidataPublicPlaces({
        latitude: centerLat,
        longitude: centerLng,
        radiusKm,
        limit: Math.min(120, maxResults),
      }),
      maxResults,
    );
    if (wikidataRows.length) {
      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: wikidataRows });
      return wikidataRows;
    }
  } catch (error) {
    console.warn("[GlobeLink viewport catalog] Wikidata fallback unavailable", error);
  }

  console.error("[GlobeLink viewport catalog] Public place APIs unavailable", lastError);
  return [];
}

function nearestArea(lat: number, lng: number, areas: Area[]) {
  let best = areas[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const area of areas) {
    const current = (lat - area.lat) ** 2 + (lng - area.lng) ** 2;
    if (current < distance) {
      best = area;
      distance = current;
    }
  }
  return best;
}

async function fetchOverpass(areas: Area[], maxResults: number): Promise<PublicCatalogItem[]> {
  const key = `overpass:${areas.map((area) => `${area.city}:${area.radius}`).join("|")}:${maxResults}`;
  const cached = memoryCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const query = buildOverpassQuery(areas, maxResults);
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": APP_IDENTITY,
          "Accept-Language": "fr,en;q=0.8",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const json = (await response.json()) as { elements?: OverpassElement[] };
      const fetchedAt = new Date().toISOString();
      const seen = new Set<string>();
      const rows = (json.elements ?? [])
        .flatMap((element) => {
          const tags = element.tags ?? {};
          const mapped = mapKind(tags);
          const title = clean(tags["name:fr"] || tags.name || tags["name:en"], 180);
          const latitude = numberOrNull(element.lat ?? element.center?.lat);
          const longitude = numberOrNull(element.lon ?? element.center?.lon);
          if (!mapped || !title || latitude == null || longitude == null) return [];
          const externalId = `${element.type}/${element.id}`;
          if (seen.has(externalId)) return [];
          seen.add(externalId);
          const area = nearestArea(latitude, longitude, areas);
          const website = safeHttps(tags.website || tags["contact:website"]);
          const image =
            safeHttps(tags.image) ||
            (tags.wikimedia_commons?.startsWith("https://")
              ? safeHttps(tags.wikimedia_commons)
              : null);
          return [
            enrichSpecializedCatalogSource({
              id: `osm-live-${element.type}-${element.id}`,
              provider: "openstreetmap-live" as const,
              external_id: externalId,
              kind: mapped.kind,
              slug: `${slugify(title)}-osm-${element.type}-${element.id}`,
              title,
              description: description(tags, mapped.kind),
              category: mapped.category,
              city: area.city,
              country: area.country,
              country_code: area.countryCode,
              latitude,
              longitude,
              image_url: image,
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
                website,
                image: safeHttps(tags.image),
                wikimedia_commons: clean(tags.wikimedia_commons, 240) || null,
                wikidata: clean(tags.wikidata, 40) || null,
                wikipedia: clean(tags.wikipedia, 200) || null,
                live: true,
              },
              fetched_at: fetchedAt,
              valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),
            } satisfies PublicCatalogItem),
          ];
        })
        .slice(0, maxResults);
      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: rows });
      return rows;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const perArea = Math.max(15, Math.ceil(maxResults / Math.max(1, areas.length)));
    const chunks = await Promise.allSettled(
      areas.map(async (area) =>
        mapWikidataRows(
          await fetchWikidataPublicPlaces({
            latitude: area.lat,
            longitude: area.lng,
            radiusKm: Math.max(2, Math.min(15, area.radius / 1000)),
            limit: perArea,
          }),
          perArea,
          area,
        ),
      ),
    );
    const fallbackRows = uniqueItems(
      chunks.flatMap((chunk) => (chunk.status === "fulfilled" ? chunk.value : [])),
    ).slice(0, maxResults);
    if (fallbackRows.length) {
      memoryCache.set(key, { expires: Date.now() + CACHE_TTL, value: fallbackRows });
      return fallbackRows;
    }
  } catch (error) {
    console.warn("[GlobeLink live catalog] Wikidata fallback unavailable", error);
  }

  console.error("[GlobeLink live catalog] Public place APIs unavailable", lastError);
  return [];
}

async function requestGeocode(candidate: string): Promise<NominatimResult | null> {
  const wait = Math.max(0, 1_100 - (Date.now() - lastNominatimRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimRequest = Date.now();

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", candidate);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "fr");
  const response = await fetch(url, {
    headers: { "User-Agent": APP_IDENTITY, "Accept-Language": "fr,en;q=0.8" },
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  return ((await response.json()) as NominatimResult[])[0] ?? null;
}

function geocodeCandidates(query: string) {
  const normalized = normalize(query);
  const hint = LOCATION_HINTS[normalized];
  const worldHub = WORLD_MAP_HUBS.find((hub) => normalize(hub.country) === normalized);
  const worldHint = worldHub ? `${worldHub.city}, ${worldHub.country}` : undefined;
  const stripped = clean(
    query
      .replace(
        /\b(restaurants?|caf[eé]s?|h[oô]tels?|auberges?|activit[eé]s?|sorties?|mus[eé]es?|plages?|parcs?|offres?|promotions?)\b/gi,
        " ",
      )
      .replace(/\b(pr[eè]s de|proche de|autour de|dans|en|a|à)\b/gi, " "),
    100,
  );
  return [hint, worldHint, query, stripped]
    .filter((value): value is string => !!value && value.trim().length >= 2)
    .filter(
      (value, index, all) =>
        all.findIndex((candidate) => normalize(candidate) === normalize(value)) === index,
    );
}

async function geocode(query: string): Promise<Area | null> {
  const key = normalize(query);
  const cached = geocodeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    for (const candidate of geocodeCandidates(query)) {
      const result = await requestGeocode(candidate);
      const lat = numberOrNull(result?.lat);
      const lng = numberOrNull(result?.lon);
      if (lat == null || lng == null) continue;
      const address = result?.address ?? {};
      const city = clean(
        address.city || address.town || address.village || address.municipality || candidate,
        100,
      );
      const country = clean(address.country || result?.display_name?.split(",").at(-1), 100);
      const countryCode = clean(address.country_code, 2).toUpperCase();
      const area = {
        city: city || candidate,
        country: country || "",
        countryCode,
        lat,
        lng,
        radius: 6500,
      };
      geocodeCache.set(key, { expires: Date.now() + SEARCH_CACHE_TTL, value: area });
      return area;
    }
    geocodeCache.set(key, { expires: Date.now() + SEARCH_CACHE_TTL, value: null });
    return null;
  } catch (error) {
    console.error("[GlobeLink live catalog] Nominatim unavailable", error);
    return null;
  }
}

function rankForQuery(items: PublicCatalogItem[], query: string) {
  const needle = normalize(query);
  return [...items].sort((a, b) => {
    const aText = normalize(`${a.title} ${a.city} ${a.country} ${a.category}`);
    const bText = normalize(`${b.title} ${b.city} ${b.country} ${b.category}`);
    const aScore = aText.startsWith(needle) ? 3 : aText.includes(needle) ? 2 : 0;
    const bScore = bText.startsWith(needle) ? 3 : bText.includes(needle) ? 2 : 0;
    return bScore - aScore || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, "fr");
  });
}

export const getHomepageInternetCatalog = createServerFn({ method: "GET" }).handler(async () => {
  return fetchOverpass(dailyAreas(2), 100);
});

export const getMapInternetCatalog = createServerFn({ method: "GET" }).handler(async () => {
  return fetchWorldMapOverpass();
});

export const getViewportInternetCatalog = createServerFn({ method: "GET" })
  .validator((raw: unknown) => {
    const data = raw as Partial<{
      south: number;
      west: number;
      north: number;
      east: number;
      zoom: number;
    }>;
    const south = Number(data.south);
    const west = Number(data.west);
    const north = Number(data.north);
    const east = Number(data.east);
    const zoom = Number(data.zoom);
    if (![south, west, north, east, zoom].every(Number.isFinite))
      throw new Error("Zone de carte invalide");
    if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east)
      throw new Error("Bornes de carte invalides");
    return { south, west, north, east, zoom: Math.max(2, Math.min(19, zoom)) };
  })
  .handler(async ({ data }) => {
    // At continental/world zoom levels, querying every POI would overload both the browser and Overpass.
    // GlobeLink shows coarse clusters from the cached world catalog, then switches to live viewport data.
    if (data.zoom < 5) return [];
    const latSpan = data.north - data.south;
    const lngSpan = data.east - data.west;
    if (latSpan > 35 || lngSpan > 50) return [];
    const maxResults = data.zoom >= 13 ? 450 : data.zoom >= 10 ? 360 : data.zoom >= 7 ? 260 : 180;
    return fetchViewportOverpass(
      { south: data.south, west: data.west, north: data.north, east: data.east },
      maxResults,
      data.zoom,
    );
  });

export const searchInternetCatalog = createServerFn({ method: "GET" })
  .validator((raw: unknown) => {
    const query = clean((raw as { query?: string })?.query, 100);
    if (query.length < 2) throw new Error("Recherche trop courte");
    return { query };
  })
  .handler(async ({ data }) => {
    const area = await geocode(data.query);
    if (!area) return [];
    const items = await fetchOverpass([area], 120);
    return rankForQuery(items, data.query);
  });
