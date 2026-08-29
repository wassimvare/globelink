import { createServerFn } from "@tanstack/react-start";
import { enrichSpecializedCatalogSource } from "./catalog-source-routing";
import type { LiveCatalogItem, LiveCatalogKind } from "./live-catalog";

type ProviderKind = Exclude<LiveCatalogKind, "deal">;
type CatalogJson =
  | string
  | number
  | boolean
  | null
  | CatalogJson[]
  | { [key: string]: CatalogJson };

type OfficialCatalogItem = Omit<LiveCatalogItem, "tags"> & {
  tags: Record<string, CatalogJson> | null;
};

export type OfficialCatalogApiInput = {
  kinds?: ProviderKind[];
  limit?: number;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
};

type ProviderContext = {
  input: OfficialCatalogApiInput;
  limit: number;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
};

type GooglePhotoAttribution = { displayName?: string; uri?: string };
type GooglePhoto = { name?: string; authorAttributions?: GooglePhotoAttribution[] };
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  photos?: GooglePhoto[];
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  websiteUri?: string;
  googleMapsUri?: string;
};

type TicketmasterImage = {
  url?: string;
  width?: number;
  height?: number;
  fallback?: boolean;
};
type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  country?: { name?: string; countryCode?: string };
  location?: { latitude?: string; longitude?: string };
};
type TicketmasterEvent = {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  images?: TicketmasterImage[];
  dates?: { start?: { dateTime?: string; localDate?: string; localTime?: string } };
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  classifications?: Array<{ segment?: { name?: string }; genre?: { name?: string } }>;
  _embedded?: { venues?: TicketmasterVenue[] };
};

export const OFFICIAL_CATALOG_API_VERSION = "official-catalog-apis-v2-google-ticketmaster";

const PROVIDER_CACHE_TTL = 15 * 60_000;
const DEFAULT_RADIUS_METERS = 12_000;
const cache = new Map<string, { expires: number; rows: OfficialCatalogItem[] }>();

export const OFFICIAL_CATALOG_API_ENV_VARS = {
  google: ["GOOGLE_PLACES_API_KEY", "GLOBELINK_GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  ticketmaster: ["TICKETMASTER_API_KEY"],
};

export type OfficialCatalogApiProviderStatus = {
  provider: keyof typeof OFFICIAL_CATALOG_API_ENV_VARS;
  label: string;
  configured: boolean;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
};

export type OfficialCatalogApiStatus = {
  version: typeof OFFICIAL_CATALOG_API_VERSION;
  anyConfigured: boolean;
  providers: OfficialCatalogApiProviderStatus[];
  missingRequiredEnvVars: string[];
};

const OFFICIAL_CATALOG_API_REQUIRED_ENV_VARS = {
  google: ["GOOGLE_PLACES_API_KEY", "GLOBELINK_GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY"],
  ticketmaster: ["TICKETMASTER_API_KEY"],
} satisfies Record<keyof typeof OFFICIAL_CATALOG_API_ENV_VARS, string[]>;

const OFFICIAL_CATALOG_API_PROVIDER_LABELS = {
  google: "Google Places",
  ticketmaster: "Ticketmaster Discovery",
} satisfies Record<keyof typeof OFFICIAL_CATALOG_API_ENV_VARS, string>;

const GOOGLE_SEARCHES: Array<{
  kind: ProviderKind;
  queryLabel: string;
  category: string;
}> = [
  { kind: "hotel", queryLabel: "hôtels", category: "hotel" },
  { kind: "restaurant", queryLabel: "restaurants", category: "restaurant" },
  { kind: "activity", queryLabel: "attractions touristiques activités", category: "activite" },
];

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

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "lieu"
  );
}

function env(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name], 1_000);
    if (value) return value;
  }
  return "";
}

function hasEnv(...names: string[]) {
  return names.some((name) => !!env(name));
}

export function getOfficialCatalogApiStatusSnapshot(): OfficialCatalogApiStatus {
  const providers = (
    Object.keys(OFFICIAL_CATALOG_API_ENV_VARS) as Array<keyof typeof OFFICIAL_CATALOG_API_ENV_VARS>
  ).map((provider) => {
    const aliases = OFFICIAL_CATALOG_API_REQUIRED_ENV_VARS[provider];
    const configured = hasEnv(...aliases);
    return {
      provider,
      label: OFFICIAL_CATALOG_API_PROVIDER_LABELS[provider],
      configured,
      requiredEnvVars: aliases,
      optionalEnvVars: [],
    };
  });

  return {
    version: OFFICIAL_CATALOG_API_VERSION,
    anyConfigured: providers.some((provider) => provider.configured),
    providers,
    missingRequiredEnvVars: providers.flatMap((provider) =>
      provider.configured ? [] : [provider.requiredEnvVars[0]],
    ),
  };
}

function validateInput(raw: Partial<OfficialCatalogApiInput>): OfficialCatalogApiInput {
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((kind): kind is ProviderKind =>
        ["activity", "hotel", "restaurant"].includes(String(kind)),
      )
    : undefined;
  const latitude = raw.latitude == null ? null : Number(raw.latitude);
  const longitude = raw.longitude == null ? null : Number(raw.longitude);
  const radiusMeters =
    raw.radiusMeters == null
      ? null
      : Math.max(500, Math.min(50_000, Math.trunc(Number(raw.radiusMeters))));
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    throw new Error("Latitude invalide");
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    throw new Error("Longitude invalide");

  return {
    kinds,
    limit: Math.min(120, Math.max(1, Math.trunc(Number(raw.limit ?? 60)))),
    city: clean(raw.city, 100) || null,
    country: clean(raw.country, 100) || null,
    latitude,
    longitude,
    radiusMeters,
  };
}

function providerContext(input: OfficialCatalogApiInput): ProviderContext {
  return {
    input,
    limit: Math.min(120, Math.max(1, Math.trunc(Number(input.limit ?? 60)))),
    city: clean(input.city, 100) || null,
    country: clean(input.country, 100) || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    radiusMeters: input.radiusMeters ?? DEFAULT_RADIUS_METERS,
  };
}

function cacheKey(input: OfficialCatalogApiInput) {
  return JSON.stringify({
    kinds: [...(input.kinds ?? ["activity", "hotel", "restaurant"])].sort(),
    limit: input.limit ?? 60,
    city: clean(input.city, 100).toLowerCase(),
    country: clean(input.country, 100).toLowerCase(),
    latitude: input.latitude == null ? null : Number(input.latitude).toFixed(3),
    longitude: input.longitude == null ? null : Number(input.longitude).toFixed(3),
    radiusMeters: input.radiusMeters ?? DEFAULT_RADIUS_METERS,
  });
}

async function fetchJson(
  url: string,
  options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown } = {},
  timeoutMs = 7_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function providerTags(
  provider: string,
  label: string,
  sourceUrl: string,
  extra: Record<string, CatalogJson | undefined> = {},
) {
  const tags: Record<string, CatalogJson> = {
    official_source_provider: provider,
    official_source_label: label,
    official_source_url: sourceUrl,
    official_source_verified: true,
    strict_official_source_verified: true,
    provider_verified: true,
    source_is_search_only: false,
    source_strategy: OFFICIAL_CATALOG_API_VERSION,
    source_verification_status: "source_officielle_api",
    primary_source_provider: provider,
    primary_source_label: label,
    primary_source_url: sourceUrl,
    reservation_source_provider: provider,
    reservation_source_label: label,
    reservation_source_url: sourceUrl,
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) tags[key] = value;
  }
  return tags;
}

function officialItem(
  row: Omit<OfficialCatalogItem, "id" | "fetched_at" | "valid_until">,
): OfficialCatalogItem {
  const now = Date.now();
  return enrichSpecializedCatalogSource({
    ...row,
    id: `${row.provider}-${slugify(row.external_id)}`,
    fetched_at: new Date(now).toISOString(),
    valid_until: new Date(now + PROVIDER_CACHE_TTL).toISOString(),
  });
}

function wants(input: OfficialCatalogApiInput, kind: ProviderKind) {
  return !input.kinds?.length || input.kinds.includes(kind);
}

function areaText(context: ProviderContext) {
  return [context.city, context.country].filter(Boolean).join(", ");
}

function googleKey() {
  return env("GOOGLE_PLACES_API_KEY", "GLOBELINK_GOOGLE_PLACES_API_KEY", "GOOGLE_MAPS_API_KEY");
}

function mapGooglePlace(
  place: GooglePlace,
  context: ProviderContext,
  kind: ProviderKind,
  fallbackCategory: string,
): OfficialCatalogItem | null {
  const externalId = clean(place.id, 180);
  const title = clean(place.displayName?.text, 180);
  const latitude = numberOrNull(place.location?.latitude);
  const longitude = numberOrNull(place.location?.longitude);
  if (!externalId || !title || latitude == null || longitude == null) return null;

  const firstPhoto = (place.photos ?? []).find((photo) => !!clean(photo?.name, 500));
  const photoName = clean(firstPhoto?.name, 500) || null;
  // GlobeLink intentionally does not invent a fallback image. A Google place is
  // only published by this strict connector when Google provides a photo reference.
  if (!photoName) return null;

  const photoAttributions = (firstPhoto?.authorAttributions ?? [])
    .map((item) => ({ displayName: clean(item.displayName, 120), uri: safeHttps(item.uri) }))
    .filter((item) => !!item.displayName)
    .slice(0, 4);
  const website = safeHttps(place.websiteUri);
  const sourceUrl =
    safeHttps(place.googleMapsUri) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [title, context.city, context.country].filter(Boolean).join(", "),
    )}&query_place_id=${encodeURIComponent(externalId)}`;

  return officialItem({
    provider: "google-places",
    external_id: externalId,
    kind,
    slug: `${slugify(title)}-google-${slugify(externalId).slice(-24)}`,
    title,
    description: null,
    category: clean(place.primaryType, 80) || fallbackCategory,
    city: context.city,
    country: context.country,
    country_code: null,
    latitude,
    longitude,
    image_url: null,
    source_url: sourceUrl,
    booking_url: website ?? sourceUrl,
    price_amount: null,
    currency: null,
    price_text: null,
    rating: numberOrNull(place.rating),
    reviews_count: Math.max(0, Math.trunc(Number(place.userRatingCount) || 0)),
    opening_hours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours?.weekdayDescriptions?.join(" · ") || null
      : null,
    tags: providerTags("google-places", "Google Places", sourceUrl, {
      google_place_id: externalId,
      google_photo_name: photoName,
      google_photo_attributions: photoAttributions as unknown as CatalogJson,
      address: clean(place.formattedAddress, 320) || null,
      website,
      primary_type: clean(place.primaryType, 80) || null,
      types: Array.isArray(place.types) ? place.types.slice(0, 20) : [],
      verified_google_place: true,
      official_image_provider: "google-places",
      source_api_provider: "google-places-api-new",
    }),
  });
}

async function fetchGoogleKind(
  context: ProviderContext,
  search: (typeof GOOGLE_SEARCHES)[number],
): Promise<OfficialCatalogItem[]> {
  const key = googleKey();
  if (!key) return [];
  const area = areaText(context);
  if (!area && (context.latitude == null || context.longitude == null)) return [];

  const body: Record<string, unknown> = {
    textQuery: [search.queryLabel, area].filter(Boolean).join(" à "),
    languageCode: "fr",
    pageSize: Math.min(20, Math.max(6, Math.ceil(context.limit / 3))),
  };
  if (context.latitude != null && context.longitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude: context.latitude, longitude: context.longitude },
        radius: Math.min(50_000, Math.max(1_000, context.radiusMeters)),
      },
    };
  }

  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.primaryType",
          "places.types",
          "places.photos",
          "places.rating",
          "places.userRatingCount",
          "places.regularOpeningHours",
          "places.websiteUri",
          "places.googleMapsUri",
        ].join(","),
      },
      body,
    },
    6_500,
  );

  const places = Array.isArray(json.places) ? (json.places as GooglePlace[]) : [];
  return places
    .map((place) => mapGooglePlace(place, context, search.kind, search.category))
    .filter((item): item is OfficialCatalogItem => !!item)
    .slice(0, Math.min(context.limit, 20));
}

function bestTicketmasterImage(images: TicketmasterImage[] | undefined) {
  return (images ?? [])
    .filter((image) => !image.fallback && !!safeHttps(image.url))
    .sort((a, b) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0))
    .map((image) => safeHttps(image.url))
    .find(Boolean) ?? null;
}

async function fetchTicketmasterEvents(context: ProviderContext): Promise<OfficialCatalogItem[]> {
  const apiKey = env("TICKETMASTER_API_KEY");
  if (!apiKey || !wants(context.input, "activity")) return [];
  if (!context.city && context.latitude == null) return [];

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("locale", "fr-fr");
  url.searchParams.set("size", String(Math.min(30, Math.max(8, Math.ceil(context.limit / 2)))));
  url.searchParams.set("sort", "date,asc");
  if (context.latitude != null && context.longitude != null) {
    url.searchParams.set("latlong", `${context.latitude},${context.longitude}`);
    url.searchParams.set("radius", String(Math.max(1, Math.round(context.radiusMeters / 1_000))));
    url.searchParams.set("unit", "km");
  } else if (context.city) {
    url.searchParams.set("city", context.city);
  }
  if (context.country) url.searchParams.set("keyword", context.country);

  const json = await fetchJson(url.toString(), {}, 6_500);
  const embedded = json._embedded;
  const events =
    embedded && typeof embedded === "object" && Array.isArray((embedded as Record<string, unknown>).events)
      ? ((embedded as Record<string, unknown>).events as TicketmasterEvent[])
      : [];

  return events.slice(0, context.limit).flatMap((event) => {
    const externalId = clean(event.id, 180);
    const title = clean(event.name, 180);
    const sourceUrl = safeHttps(event.url);
    const imageUrl = bestTicketmasterImage(event.images);
    const venue = event._embedded?.venues?.[0];
    const latitude = numberOrNull(venue?.location?.latitude);
    const longitude = numberOrNull(venue?.location?.longitude);
    if (!externalId || !title || !sourceUrl || !imageUrl || latitude == null || longitude == null)
      return [];

    const price = event.priceRanges?.[0];
    const startDateTime =
      clean(event.dates?.start?.dateTime, 80) ||
      [clean(event.dates?.start?.localDate, 20), clean(event.dates?.start?.localTime, 20)]
        .filter(Boolean)
        .join("T") ||
      null;
    const venueName = clean(venue?.name, 160) || null;
    const city = clean(venue?.city?.name, 100) || context.city;
    const country = clean(venue?.country?.name, 100) || context.country;

    return [
      officialItem({
        provider: "ticketmaster",
        external_id: externalId,
        kind: "activity",
        slug: `${slugify(title)}-ticketmaster-${slugify(externalId).slice(-24)}`,
        title,
        description: clean(event.info || event.pleaseNote, 1_200) || null,
        category: "event",
        city,
        country,
        country_code: clean(venue?.country?.countryCode, 8) || null,
        latitude,
        longitude,
        image_url: imageUrl,
        source_url: sourceUrl,
        booking_url: sourceUrl,
        price_amount: numberOrNull(price?.min),
        currency: clean(price?.currency, 12) || null,
        price_text:
          price?.min != null
            ? `${Number(price.min).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${clean(price.currency, 12)}`.trim()
            : null,
        rating: null,
        reviews_count: 0,
        opening_hours: null,
        tags: providerTags("ticketmaster", "Ticketmaster", sourceUrl, {
          official_image_url: imageUrl,
          source_api_provider: "ticketmaster-discovery-api-v2",
          event_subtype: "ticketmaster-event",
          event_start_date_time: startDateTime,
          venue_name: venueName,
          segment: clean(event.classifications?.[0]?.segment?.name, 80) || null,
          genre: clean(event.classifications?.[0]?.genre?.name, 80) || null,
        }),
      }),
    ];
  });
}

export async function fetchOfficialCatalogRows(
  input: OfficialCatalogApiInput,
): Promise<OfficialCatalogItem[]> {
  const context = providerContext(input);
  if (!context.city && !context.country && context.latitude == null) return [];

  const providers: Array<Promise<OfficialCatalogItem[]>> = [];
  for (const search of GOOGLE_SEARCHES) {
    if (wants(input, search.kind)) providers.push(fetchGoogleKind(context, search));
  }
  if (wants(input, "activity")) providers.push(fetchTicketmasterEvents(context));

  const settled = await Promise.allSettled(providers);
  const rows = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  return rows.filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.provider === item.provider && candidate.external_id === item.external_id,
      ) === index,
  );
}

export const fetchOfficialProviderCatalog = createServerFn({ method: "GET" })
  .validator((raw: unknown) => validateInput((raw ?? {}) as Partial<OfficialCatalogApiInput>))
  .handler(async ({ data }) => {
    const key = cacheKey(data);
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.rows;
    const rows = await fetchOfficialCatalogRows(data);
    cache.set(key, { expires: Date.now() + PROVIDER_CACHE_TTL, rows });
    return rows;
  });

export const getOfficialCatalogApiStatus = createServerFn({ method: "GET" }).handler(async () =>
  getOfficialCatalogApiStatusSnapshot(),
);
