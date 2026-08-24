import { createServerFn } from "@tanstack/react-start";
import type { PlaceCategory } from "./countries";

// `amadeus` remains accepted in the UI-facing union for backward compatibility
// with already-built clients, but the server no longer calls or configures it.
export type TravelProvider = "google" | "amadeus" | "ticketmaster" | "community";

export type VerifiedTravelPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  country: string;
  city: string;
  lat: number;
  lng: number;
  description: string;
  image_url: string;
  photos: string[];
  budget: 1 | 2 | 3 | 4 | null;
  rating: number | null;
  reviews_count: number;
  hours: string;
  comments: { author: string; text: string; avatar: string }[];
  source: TravelProvider;
  sourceUrl: string;
  priceLabel?: string;
  photoAttribution?: string;
  photoAttributionUrl?: string;
};

type ProviderState = {
  configured: boolean;
  ok: boolean;
  count: number;
};

export type VerifiedTravelDiscovery = {
  query: string;
  anchor: { lat: number; lng: number; label: string };
  places: VerifiedTravelPlace[];
  providers: {
    google: ProviderState;
    ticketmaster: ProviderState;
    // Optional only so older UI code can safely read this property.
    // It is intentionally omitted from every new server response.
    amadeus?: ProviderState;
  };
  generatedAt: string;
};

type DiscoveryInput = {
  query?: string;
  lat?: number;
  lng?: number;
};

type GooglePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: GooglePhoto[];
  googleMapsUri?: string;
  googleMapsLinks?: { placeUri?: string };
};

const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const cache = new Map<string, { expiresAt: number; value: VerifiedTravelDiscovery }>();

const FEATURED_LOCATIONS = [
  { label: "Paris, France", lat: 48.8566, lng: 2.3522 },
  { label: "Lisbonne, Portugal", lat: 38.7223, lng: -9.1393 },
  { label: "Marrakech, Maroc", lat: 31.6295, lng: -7.9811 },
  { label: "Bali, Indonésie", lat: -8.3405, lng: 115.092 },
  { label: "Bangkok, Thaïlande", lat: 13.7563, lng: 100.5018 },
  { label: "Tokyo, Japon", lat: 35.6762, lng: 139.6503 },
  { label: "New York, États-Unis", lat: 40.7128, lng: -74.006 },
  { label: "Sydney, Australie", lat: -33.8688, lng: 151.2093 },
] as const;

function cleanQuery(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F<>`{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function finiteCoord(value: unknown, min: number, max: number): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return undefined;
  return number;
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function dailyFeaturedLocation() {
  const day = Math.floor(Date.now() / 86_400_000);
  return FEATURED_LOCATIONS[day % FEATURED_LOCATIONS.length];
}

function matchingFeaturedLocation(query: string) {
  const needle = normalizeKey(query);
  if (!needle) return undefined;
  return FEATURED_LOCATIONS.find((item) => {
    const haystack = normalizeKey(item.label);
    return haystack.includes(needle) || needle.includes(haystack.split("-")[0]);
  });
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function addressParts(address: string | undefined, fallbackCity: string) {
  const parts = String(address ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return {
    city: fallbackCity || (parts.length >= 2 ? parts[parts.length - 2] : ""),
    country: parts.length ? parts[parts.length - 1] : "",
  };
}

function googleBudget(priceLevel?: string): 1 | 2 | 3 | 4 | null {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE": return 1;
    case "PRICE_LEVEL_MODERATE": return 2;
    case "PRICE_LEVEL_EXPENSIVE": return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
    default: return null;
  }
}

async function googlePhotoUrl(apiKey: string, photo?: GooglePhoto) {
  if (!photo?.name) return { url: "", attribution: "", attributionUrl: "" };
  const media = await fetchJson<{ photoUri?: string }>(
    `https://places.googleapis.com/v1/${photo.name}/media?key=${encodeURIComponent(apiKey)}&maxWidthPx=1200&skipHttpRedirect=true`,
  );
  const author = photo.authorAttributions?.[0];
  return {
    url: media?.photoUri ?? "",
    attribution: author?.displayName ?? "",
    attributionUrl: author?.uri?.startsWith("//") ? `https:${author.uri}` : (author?.uri ?? ""),
  };
}

async function googleTextSearch(
  apiKey: string,
  textQuery: string,
  category: PlaceCategory,
  fallbackCity: string,
  bias?: { lat: number; lng: number },
) {
  const body: Record<string, unknown> = {
    textQuery,
    pageSize: 6,
    languageCode: "fr",
  };
  if (bias) {
    body.locationBias = {
      circle: {
        center: { latitude: bias.lat, longitude: bias.lng },
        radius: 30_000,
      },
    };
  }

  const response = await fetchJson<{ places?: GooglePlace[] }>(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
          "places.regularOpeningHours",
          "places.photos",
          "places.googleMapsUri",
          "places.googleMapsLinks",
        ].join(","),
      },
      body: JSON.stringify(body),
    },
  );

  if (!response) return { ok: false, raw: [] as GooglePlace[], places: [] as VerifiedTravelPlace[] };

  const raw = (response.places ?? []).filter(
    (place) => Number.isFinite(place.location?.latitude) && Number.isFinite(place.location?.longitude),
  );

  const mapped = await Promise.all(raw.map(async (place) => {
    const photo = await googlePhotoUrl(apiKey, place.photos?.[0]);
    const names = addressParts(place.formattedAddress, fallbackCity);
    const weekday = place.regularOpeningHours?.weekdayDescriptions?.[0] ?? "Horaires à vérifier sur Google Maps";
    return {
      id: `google-${place.id ?? normalizeKey(`${place.displayName?.text}-${place.formattedAddress}`)}`,
      name: place.displayName?.text?.trim() || "Lieu vérifié",
      category,
      country: names.country,
      city: names.city,
      lat: Number(place.location?.latitude),
      lng: Number(place.location?.longitude),
      description: place.formattedAddress ?? "",
      image_url: photo.url,
      photos: photo.url ? [photo.url] : [],
      budget: googleBudget(place.priceLevel),
      rating: Number.isFinite(place.rating) ? Number(place.rating) : null,
      reviews_count: Number.isFinite(place.userRatingCount) ? Number(place.userRatingCount) : 0,
      hours: weekday,
      comments: [],
      source: "google" as const,
      sourceUrl: place.googleMapsLinks?.placeUri ?? place.googleMapsUri ?? "",
      photoAttribution: photo.attribution || undefined,
      photoAttributionUrl: photo.attributionUrl || undefined,
    } satisfies VerifiedTravelPlace;
  }));

  return { ok: true, raw, places: mapped };
}

async function ticketmasterNearby(anchor: { lat: number; lng: number; label: string }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return { ok: false, places: [] as VerifiedTravelPlace[] };

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${anchor.lat},${anchor.lng}`,
    radius: "50",
    unit: "km",
    size: "10",
    sort: "distance,asc",
    locale: "fr,*",
    startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  });

  const response = await fetchJson<{
    _embedded?: {
      events?: Array<{
        id?: string;
        name?: string;
        url?: string;
        images?: Array<{ url?: string; width?: number; height?: number }>;
        dates?: { start?: { localDate?: string; localTime?: string } };
        priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
        _embedded?: { venues?: Array<{
          name?: string;
          city?: { name?: string };
          country?: { name?: string };
          location?: { latitude?: string; longitude?: string };
        }> };
      }>;
    };
  }>(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`);

  if (!response) return { ok: false, places: [] as VerifiedTravelPlace[] };

  const places: VerifiedTravelPlace[] = (response._embedded?.events ?? []).flatMap((event) => {
    const venue = event._embedded?.venues?.[0];
    const lat = Number(venue?.location?.latitude);
    const lng = Number(venue?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !event.name) return [];

    const image = [...(event.images ?? [])]
      .filter((item) => item.url)
      .sort((a, b) => (Number(b.width) * Number(b.height)) - (Number(a.width) * Number(a.height)))[0]?.url ?? "";
    const date = event.dates?.start?.localDate;
    const time = event.dates?.start?.localTime?.slice(0, 5);
    const when = [date, time].filter(Boolean).join(" · ");
    const price = event.priceRanges?.[0];
    const priceLabel = Number.isFinite(price?.min)
      ? `dès ${price?.min} ${price?.currency ?? ""}`.trim()
      : undefined;

    return [{
      id: `ticketmaster-${event.id ?? normalizeKey(event.name)}`,
      name: event.name,
      category: "event",
      country: venue?.country?.name ?? "",
      city: venue?.city?.name ?? anchor.label.split(",")[0]?.trim() ?? "",
      lat,
      lng,
      description: [when, venue?.name].filter(Boolean).join(" · "),
      image_url: image,
      photos: image ? [image] : [],
      budget: null,
      rating: null,
      reviews_count: 0,
      hours: when,
      comments: [],
      source: "ticketmaster",
      sourceUrl: event.url ?? "",
      priceLabel,
    }];
  });

  return { ok: true, places };
}

function dedupePlaces(items: VerifiedTravelPlace[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalizeKey(item.name)}-${item.lat.toFixed(3)}-${item.lng.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 80);
}

async function buildDiscovery(input: DiscoveryInput): Promise<VerifiedTravelDiscovery> {
  const query = cleanQuery(input.query);
  const lat = finiteCoord(input.lat, -90, 90);
  const lng = finiteCoord(input.lng, -180, 180);
  const providedAnchor = lat !== undefined && lng !== undefined
    ? { lat, lng, label: query || "Autour de toi" }
    : undefined;
  const seed = matchingFeaturedLocation(query) ?? dailyFeaturedLocation();

  const googleKey = process.env.GOOGLE_PLACES_API_KEY;
  const googleConfigured = Boolean(googleKey);
  const ticketmasterConfigured = Boolean(process.env.TICKETMASTER_API_KEY);

  let googleOk = false;
  let googlePlaces: VerifiedTravelPlace[] = [];
  let googleAnchor: { lat: number; lng: number; label: string } | undefined;

  if (googleKey) {
    const bias = providedAnchor ? { lat: providedAnchor.lat, lng: providedAnchor.lng } : undefined;
    const label = query || providedAnchor?.label || seed.label;
    const suffix = query ? ` à ${query}` : "";
    const defaultBias = bias ?? (!query ? { lat: seed.lat, lng: seed.lng } : undefined);

    // Google Places is the single verified source for establishments/POIs.
    // Keeping all three categories on the same provider prevents mismatched photos
    // or duplicate hotel/activity records from unrelated catalogues.
    const [restaurants, hotels, attractions] = await Promise.all([
      googleTextSearch(
        googleKey,
        query ? `restaurants${suffix}` : "restaurants",
        "restaurant",
        label.split(",")[0] ?? label,
        defaultBias,
      ),
      googleTextSearch(
        googleKey,
        query ? `hôtels${suffix}` : "hôtels",
        "hotel",
        label.split(",")[0] ?? label,
        defaultBias,
      ),
      googleTextSearch(
        googleKey,
        query ? `activités touristiques et attractions${suffix}` : "activités touristiques et attractions",
        "activite",
        label.split(",")[0] ?? label,
        defaultBias,
      ),
    ]);

    googleOk = restaurants.ok || hotels.ok || attractions.ok;
    googlePlaces = [...restaurants.places, ...hotels.places, ...attractions.places];

    const first = [...restaurants.raw, ...hotels.raw, ...attractions.raw].find((place) => place.location);
    if (Number.isFinite(first?.location?.latitude) && Number.isFinite(first?.location?.longitude)) {
      googleAnchor = {
        lat: Number(first?.location?.latitude),
        lng: Number(first?.location?.longitude),
        label,
      };
    }
  }

  const anchor = providedAnchor ?? googleAnchor ?? {
    lat: seed.lat,
    lng: seed.lng,
    label: query || seed.label,
  };

  const ticketmaster = ticketmasterConfigured
    ? await ticketmasterNearby(anchor)
    : { ok: false, places: [] as VerifiedTravelPlace[] };

  const places = dedupePlaces([...googlePlaces, ...ticketmaster.places]);

  return {
    query: query || anchor.label,
    anchor,
    places,
    providers: {
      google: { configured: googleConfigured, ok: googleOk, count: googlePlaces.length },
      ticketmaster: {
        configured: ticketmasterConfigured,
        ok: ticketmaster.ok,
        count: ticketmaster.places.length,
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

export const discoverVerifiedTravelPlaces = createServerFn({ method: "POST" })
  .inputValidator((value: unknown): DiscoveryInput => {
    const data = (value ?? {}) as Partial<DiscoveryInput>;
    const query = cleanQuery(data.query);
    const lat = finiteCoord(data.lat, -90, 90);
    const lng = finiteCoord(data.lng, -180, 180);
    if ((lat === undefined) !== (lng === undefined)) {
      throw new Error("Latitude et longitude doivent être fournies ensemble.");
    }
    return { query: query || undefined, lat, lng };
  })
  .handler(async ({ data }) => {
    const cacheKey = JSON.stringify({
      q: data.query ?? "",
      lat: data.lat?.toFixed(3),
      lng: data.lng?.toFixed(3),
    });
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await buildDiscovery(data);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });

    if (cache.size > 40) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (oldestKey) cache.delete(oldestKey);
    }
    return value;
  });
