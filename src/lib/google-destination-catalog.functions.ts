import { createServerFn } from "@tanstack/react-start";
import { enrichSpecializedCatalogSource } from "./catalog-source-routing";
import type { LiveCatalogItem, LiveCatalogKind } from "./live-catalog";

export type GoogleDestinationCatalogInput = {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
};

type GooglePhotoAttribution = { displayName?: string; uri?: string };
type GooglePhoto = { name?: string; authorAttributions?: GooglePhotoAttribution[] };
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  primaryType?: string;
  types?: string[];
  photos?: GooglePhoto[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
};

type CatalogJson =
  string | number | boolean | null | CatalogJson[] | { [key: string]: CatalogJson };
type GoogleCatalogItem = Omit<LiveCatalogItem, "tags"> & {
  tags: Record<string, CatalogJson> | null;
};

type CatalogSearch = {
  kind: Exclude<LiveCatalogKind, "deal">;
  category: string;
  label: string;
  nearbyType: string;
};

const SEARCHES: CatalogSearch[] = [
  {
    kind: "activity",
    label: "attractions touristiques",
    category: "activite",
    nearbyType: "tourist_attraction",
  },
  { kind: "restaurant", label: "restaurants", category: "restaurant", nearbyType: "restaurant" },
  { kind: "hotel", label: "hôtels", category: "hotel", nearbyType: "hotel" },
];

const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { expires: number; rows: GoogleCatalogItem[] }>();

function clean(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(clean(value, 2_000));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "lieu"
  );
}

function apiKey() {
  return clean(
    process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GLOBELINK_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY,
    512,
  );
}

function validateInput(data: GoogleDestinationCatalogInput): GoogleDestinationCatalogInput {
  const city = clean(data?.city, 100);
  const country = clean(data?.country, 100);
  const latitude = Number(data?.latitude);
  const longitude = Number(data?.longitude);
  if (!city || !country) throw new Error("Destination invalide");
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    throw new Error("Latitude invalide");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    throw new Error("Longitude invalide");
  return { city, country, latitude, longitude };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 5_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapPlace(
  place: GooglePlace,
  search: CatalogSearch,
  input: GoogleDestinationCatalogInput,
): GoogleCatalogItem | null {
  const id = clean(place.id, 180);
  const title = clean(place.displayName?.text, 180);
  const latitude = Number(place.location?.latitude);
  const longitude = Number(place.location?.longitude);
  if (!id || !title || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const firstPhoto = (place.photos ?? []).find((photo) => !!clean(photo?.name, 500));
  const photoName = clean(firstPhoto?.name, 500) || null;
  const photoAttributions = (firstPhoto?.authorAttributions ?? [])
    .map((item) => ({ displayName: clean(item.displayName, 120), uri: safeHttps(item.uri) }))
    .filter((item) => !!item.displayName)
    .slice(0, 4);
  const website = safeHttps(place.websiteUri);
  const address = clean(place.formattedAddress, 320) || null;
  const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title}, ${input.city}, ${input.country}`)}&query_place_id=${encodeURIComponent(id)}`;
  const now = new Date();

  return enrichSpecializedCatalogSource({
    id: `google-${id}`,
    provider: "google-places",
    external_id: id,
    kind: search.kind,
    slug: `${slugify(title)}-google-${slugify(id).slice(-24)}`,
    title,
    description: null,
    category: clean(place.primaryType, 80) || search.category,
    city: input.city,
    country: input.country,
    country_code: null,
    latitude,
    longitude,
    // The browser never receives the API key. CatalogImage turns the server-side
    // photo reference below into a short-lived media URL when the card renders.
    image_url: null,
    source_url: sourceUrl,
    booking_url: website,
    price_amount: null,
    currency: null,
    price_text: null,
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    reviews_count: Math.max(0, Math.trunc(Number(place.userRatingCount) || 0)),
    opening_hours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours?.weekdayDescriptions?.join(" · ") || null
      : null,
    tags: {
      google_place_id: id,
      google_photo_name: photoName,
      google_photo_attributions: photoAttributions,
      address,
      website,
      primary_type: clean(place.primaryType, 80) || null,
      types: Array.isArray(place.types) ? place.types.slice(0, 20) : [],
      verified_google_place: true,
      strict_source_policy: "strict-official-sources-v1",
      official_source_provider: search.kind === "restaurant" ? "google-places" : null,
      official_source_label: search.kind === "restaurant" ? "Google Maps" : null,
      official_source_verified: search.kind === "restaurant" && !!photoName,
      source_is_search_only: search.kind !== "restaurant",
      source_verification_status:
        search.kind === "restaurant" && photoName
          ? "source_officielle_verifiee"
          : "source_non_autorisee_par_la_regle_stricte",
    },
    fetched_at: now.toISOString(),
    valid_until: new Date(now.getTime() + CACHE_TTL).toISOString(),
  });
}

async function searchGoogleNearby(
  key: string,
  input: GoogleDestinationCatalogInput,
  search: CatalogSearch,
) {
  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.location",
          "places.formattedAddress",
          "places.primaryType",
          "places.types",
          "places.photos",
          "places.rating",
          "places.userRatingCount",
          "places.regularOpeningHours",
          "places.websiteUri",
        ].join(","),
      },
      body: JSON.stringify({
        includedTypes: [search.nearbyType],
        languageCode: "fr",
        maxResultCount: 20,
        rankPreference: "POPULARITY",
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: 15_000,
          },
        },
      }),
    },
    4_500,
  );
  const places = Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
  return places
    .map((place) => mapPlace(place, search, input))
    .filter((item): item is GoogleCatalogItem => !!item)
    .slice(0, 20);
}

async function searchGoogle(
  key: string,
  input: GoogleDestinationCatalogInput,
  search: CatalogSearch,
) {
  const textQuery = `${search.label} à ${input.city}, ${input.country}`;
  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.location",
          "places.formattedAddress",
          "places.primaryType",
          "places.types",
          "places.photos",
          "places.rating",
          "places.userRatingCount",
          "places.regularOpeningHours",
          "places.websiteUri",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "fr",
        pageSize: 12,
        locationBias: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: 12_000,
          },
        },
      }),
    },
    5_500,
  );
  const places = Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
  return places
    .map((place) => mapPlace(place, search, input))
    .filter((item): item is GoogleCatalogItem => !!item)
    .slice(0, 10);
}

export const fetchGoogleDestinationCatalog = createServerFn({ method: "POST" })
  .validator((data: GoogleDestinationCatalogInput) => validateInput(data))
  .handler(async ({ data }) => {
    const key = apiKey();
    if (!key) return [] as GoogleCatalogItem[];
    const cacheKey = `${data.city.toLowerCase()}|${data.country.toLowerCase()}|${data.latitude.toFixed(3)}|${data.longitude.toFixed(3)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.rows;

    // Nearby Search is far more deterministic for destination pages than a broad
    // free-text query. Run one typed request per category around the city hub.
    const nearbySettled = await Promise.allSettled(
      SEARCHES.map((search) => searchGoogleNearby(key, data, search)),
    );
    let rows = nearbySettled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );

    // If one category is missing, fill only that category with Text Search. This
    // keeps the first paint fast while still covering hotels/activities that Google
    // may classify more specifically than the generic Nearby type.
    const kinds = new Set(rows.map((item) => item.kind));
    const missing = SEARCHES.filter((search) => !kinds.has(search.kind));
    if (missing.length) {
      const textSettled = await Promise.allSettled(
        missing.map((search) => searchGoogle(key, data, search)),
      );
      rows = [
        ...rows,
        ...textSettled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      ];
    }

    const unique = rows.filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.external_id === item.external_id) === index,
    );
    if (unique.length) cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, rows: unique });
    return unique;
  });
