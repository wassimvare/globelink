import { createServerFn } from "@tanstack/react-start";
import {
  bookingHotelUrl,
  enrichSpecializedCatalogSource,
  getYourGuideActivityUrl,
  googlePlacesSearchUrl,
  tripadvisorSearchUrl,
} from "./catalog-source-routing";
import type { LiveCatalogItem, LiveCatalogKind } from "./live-catalog";

type ProviderKind = Exclude<LiveCatalogKind, "deal">;
type CatalogJson =
  string | number | boolean | null | CatalogJson[] | { [key: string]: CatalogJson };
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

type FetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export const OFFICIAL_CATALOG_API_VERSION = "official-catalog-apis-v1";

const PROVIDER_CACHE_TTL = 12 * 60 * 60_000;
const DEFAULT_RADIUS_METERS = 8_000;
const cache = new Map<string, { expires: number; rows: OfficialCatalogItem[] }>();

export const OFFICIAL_CATALOG_API_ENV_VARS = {
  booking: [
    "BOOKING_API_TOKEN",
    "BOOKING_PARTNER_API_KEY",
    "BOOKING_AFFILIATE_ID",
    "BOOKING_API_BASE_URL",
    "BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT",
  ],
  tripadvisor: ["TRIPADVISOR_API_KEY", "TRIPADVISOR_API_BASE_URL"],
  getyourguide: [
    "GETYOURGUIDE_API_KEY",
    "GETYOURGUIDE_PARTNER_API_KEY",
    "GETYOURGUIDE_API_BASE_URL",
  ],
  restaurants: ["YELP_API_KEY", "YELP_API_BASE_URL"],
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
  booking: ["BOOKING_API_TOKEN", "BOOKING_PARTNER_API_KEY"],
  tripadvisor: ["TRIPADVISOR_API_KEY"],
  getyourguide: ["GETYOURGUIDE_API_KEY", "GETYOURGUIDE_PARTNER_API_KEY"],
  restaurants: ["YELP_API_KEY"],
} satisfies Record<keyof typeof OFFICIAL_CATALOG_API_ENV_VARS, string[]>;

const OFFICIAL_CATALOG_API_PROVIDER_LABELS = {
  booking: "Booking.com",
  tripadvisor: "Tripadvisor",
  getyourguide: "GetYourGuide",
  restaurants: "Yelp Restaurants",
} satisfies Record<keyof typeof OFFICIAL_CATALOG_API_ENV_VARS, string>;

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
    const requiredEnvVars = OFFICIAL_CATALOG_API_REQUIRED_ENV_VARS[provider];
    const optionalEnvVars = OFFICIAL_CATALOG_API_ENV_VARS[provider].filter(
      (name) => !requiredEnvVars.includes(name),
    );
    return {
      provider,
      label: OFFICIAL_CATALOG_API_PROVIDER_LABELS[provider],
      configured: hasEnv(...requiredEnvVars),
      requiredEnvVars,
      optionalEnvVars,
    };
  });
  return {
    version: OFFICIAL_CATALOG_API_VERSION,
    anyConfigured: providers.some((provider) => provider.configured),
    providers,
    missingRequiredEnvVars: providers.flatMap((provider) =>
      provider.configured ? [] : provider.requiredEnvVars,
    ),
  };
}

function envBase(name: string, fallback: string) {
  return env(name).replace(/\/+$/, "") || fallback;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "results", "items", "businesses", "tours", "accommodations"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

function nested(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function firstString(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = nested(item, path);
    if (typeof value === "string" && value.trim()) return clean(value, 500);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = numberOrNull(nested(item, path));
    if (value != null) return value;
  }
  return null;
}

function firstHttps(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = nested(item, path);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const direct = safeHttps(entry);
        if (direct) return direct;
        const nestedUrl = safeHttps(nested(entry, "url") ?? nested(entry, "large.url"));
        if (nestedUrl) return nestedUrl;
      }
    }
    const url = safeHttps(value);
    if (url) return url;
  }
  return null;
}

function areaText(context: ProviderContext) {
  return [context.city, context.country].filter(Boolean).join(", ");
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
    limit: Math.min(240, Math.max(1, Math.trunc(Number(raw.limit ?? 80)))),
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
    limit: Math.min(240, Math.max(1, Math.trunc(Number(input.limit ?? 80)))),
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
    limit: input.limit ?? 80,
    city: clean(input.city, 100).toLowerCase(),
    country: clean(input.country, 100).toLowerCase(),
    latitude: input.latitude == null ? null : Number(input.latitude).toFixed(3),
    longitude: input.longitude == null ? null : Number(input.longitude).toFixed(3),
    radiusMeters: input.radiusMeters ?? DEFAULT_RADIUS_METERS,
  });
}

async function fetchJson(url: string, options: FetchOptions = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 7_500);
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

async function fetchBookingHotels(context: ProviderContext): Promise<OfficialCatalogItem[]> {
  const token = env("BOOKING_API_TOKEN", "BOOKING_PARTNER_API_KEY");
  if (!token) return [];
  const affiliateId = env("BOOKING_AFFILIATE_ID");
  const base = envBase("BOOKING_API_BASE_URL", "https://demandapi.booking.com/3.1");
  const endpoint = env("BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT") || `${base}/accommodations/search`;
  const body: Record<string, unknown> = {
    booker: { country: "fr", platform: "desktop" },
    currency: "EUR",
    language: "fr",
    guests: { number_of_adults: 2, number_of_rooms: 1 },
    rows: Math.min(50, context.limit),
    extras: ["extra_charges", "photos"],
  };
  if (context.latitude != null && context.longitude != null) {
    body.coordinates = {
      latitude: context.latitude,
      longitude: context.longitude,
      radius: Math.max(1, Math.round(context.radiusMeters / 1000)),
    };
  } else if (context.city || context.country) {
    body.query = areaText(context);
  } else {
    return [];
  }

  const json = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Booking-API-Key": token,
      ...(affiliateId ? { "X-Affiliate-Id": affiliateId } : {}),
    },
    body,
  });

  return asArray(json)
    .slice(0, context.limit)
    .flatMap((item) => {
      const externalId = firstString(item, ["id", "hotel_id", "accommodation_id"]);
      const title = firstString(item, ["name", "hotel_name", "accommodation.name"]);
      if (!externalId || !title) return [];
      const sourceUrl =
        firstHttps(item, ["url", "booking_url", "deep_link", "page_url"]) ||
        bookingHotelUrl({ title, city: context.city, country: context.country });
      const imageUrl = firstHttps(item, [
        "main_photo_url",
        "photo_url",
        "image_url",
        "photos",
        "photos.0.url",
      ]);
      if (!imageUrl) return [];
      return [
        officialItem({
          provider: "booking-com",
          external_id: externalId,
          kind: "hotel",
          slug: `${slugify(title)}-booking-${slugify(externalId).slice(-24)}`,
          title,
          description: firstString(item, ["description", "summary"]) || null,
          category: "hotel",
          city: context.city,
          country: context.country,
          country_code: firstString(item, ["country_code", "address.country_code"]) || null,
          latitude: firstNumber(item, ["latitude", "location.latitude", "coordinates.latitude"]),
          longitude: firstNumber(item, [
            "longitude",
            "location.longitude",
            "coordinates.longitude",
          ]),
          image_url: imageUrl,
          source_url: sourceUrl,
          booking_url: sourceUrl,
          price_amount: firstNumber(item, ["price.amount", "price.total", "min_total_price"]),
          currency: firstString(item, ["price.currency", "currency"]) || null,
          price_text: null,
          rating: firstNumber(item, ["review_score", "rating", "score"]),
          reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["review_count"]) ?? 0)),
          opening_hours: null,
          tags: providerTags("booking-com", "Booking.com", sourceUrl, {
            official_image_url: imageUrl,
            source_api_provider: "booking-demand-api",
          }),
        }),
      ];
    });
}

async function tripadvisorPhoto(apiKey: string, locationId: string) {
  const base = envBase("TRIPADVISOR_API_BASE_URL", "https://api.content.tripadvisor.com/api/v1");
  const url = new URL(`${base}/location/${encodeURIComponent(locationId)}/photos`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "fr");
  const json = await fetchJson(url.toString(), { timeoutMs: 4_500 });
  return firstHttps(json, ["data.0.images.large.url", "data.0.images.original.url", "data.0.url"]);
}

async function fetchTripadvisorActivities(
  context: ProviderContext,
): Promise<OfficialCatalogItem[]> {
  const apiKey = env("TRIPADVISOR_API_KEY");
  if (!apiKey || (!context.city && !context.country && context.latitude == null)) return [];
  const base = envBase("TRIPADVISOR_API_BASE_URL", "https://api.content.tripadvisor.com/api/v1");
  const url = new URL(`${base}/location/search`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "fr");
  url.searchParams.set("category", "attractions");
  url.searchParams.set("searchQuery", areaText(context) || "attractions");
  if (context.latitude != null && context.longitude != null) {
    url.searchParams.set("latLong", `${context.latitude},${context.longitude}`);
  }
  const json = await fetchJson(url.toString());
  const rows: OfficialCatalogItem[] = [];
  for (const item of asArray(json).slice(0, Math.min(context.limit, 16))) {
    const externalId = firstString(item, ["location_id", "id"]);
    const title = firstString(item, ["name", "title"]);
    if (!externalId || !title) continue;
    const sourceUrl =
      firstHttps(item, ["web_url", "url"]) ||
      tripadvisorSearchUrl({ title, city: context.city, country: context.country }, "activité");
    const imageUrl = await tripadvisorPhoto(apiKey, externalId).catch(() => null);
    if (!imageUrl) continue;
    rows.push(
      officialItem({
        provider: "tripadvisor-attractions",
        external_id: externalId,
        kind: "activity",
        slug: `${slugify(title)}-tripadvisor-${slugify(externalId).slice(-24)}`,
        title,
        description: firstString(item, ["description", "ranking_data.ranking_string"]) || null,
        category: "activite",
        city: context.city || firstString(item, ["address_obj.city"]) || null,
        country: context.country || firstString(item, ["address_obj.country"]) || null,
        country_code: null,
        latitude: firstNumber(item, ["latitude"]),
        longitude: firstNumber(item, ["longitude"]),
        image_url: imageUrl,
        source_url: sourceUrl,
        booking_url: sourceUrl,
        price_amount: null,
        currency: null,
        price_text: null,
        rating: firstNumber(item, ["rating"]),
        reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["num_reviews"]) ?? 0)),
        opening_hours: null,
        tags: providerTags("tripadvisor-attractions", "Tripadvisor", sourceUrl, {
          official_image_url: imageUrl,
          source_api_provider: "tripadvisor-content-api",
        }),
      }),
    );
  }
  return rows;
}

async function fetchGetYourGuideActivities(
  context: ProviderContext,
): Promise<OfficialCatalogItem[]> {
  const apiKey = env("GETYOURGUIDE_API_KEY", "GETYOURGUIDE_PARTNER_API_KEY");
  if (!apiKey || (!context.city && !context.country && context.latitude == null)) return [];
  const base = envBase("GETYOURGUIDE_API_BASE_URL", "https://api.getyourguide.com/1");
  const url = new URL(`${base}/tours`);
  url.searchParams.set("q", areaText(context) || "activity");
  url.searchParams.set("cnt_language", "fr");
  url.searchParams.set("currency", "EUR");
  url.searchParams.set("limit", String(Math.min(context.limit, 50)));
  if (context.latitude != null && context.longitude != null) {
    url.searchParams.set("coordinates", `${context.latitude},${context.longitude}`);
    url.searchParams.set("radius", String(Math.max(1, Math.round(context.radiusMeters / 1000))));
  }
  const json = await fetchJson(url.toString(), {
    headers: { "X-ACCESS-TOKEN": apiKey, Authorization: `Bearer ${apiKey}` },
  });
  return asArray(json)
    .slice(0, context.limit)
    .flatMap((item) => {
      const externalId = firstString(item, ["tour_id", "id", "activity_id"]);
      const title = firstString(item, ["title", "name"]);
      if (!externalId || !title) return [];
      const sourceUrl =
        firstHttps(item, ["url", "deeplink", "booking_url", "abstract_link"]) ||
        getYourGuideActivityUrl({ title, city: context.city, country: context.country });
      const imageUrl = firstHttps(item, [
        "pictures",
        "images",
        "image.url",
        "pictures.0.url",
        "images.0.url",
      ]);
      if (!imageUrl) return [];
      return [
        officialItem({
          provider: "getyourguide",
          external_id: externalId,
          kind: "activity",
          slug: `${slugify(title)}-getyourguide-${slugify(externalId).slice(-24)}`,
          title,
          description: firstString(item, ["abstract", "description", "teaser_text"]) || null,
          category: "activite",
          city: context.city,
          country: context.country,
          country_code: null,
          latitude: firstNumber(item, ["coordinates.lat", "latitude", "location.latitude"]),
          longitude: firstNumber(item, ["coordinates.long", "longitude", "location.longitude"]),
          image_url: imageUrl,
          source_url: sourceUrl,
          booking_url: sourceUrl,
          price_amount: firstNumber(item, ["price.values.amount", "price.amount"]),
          currency: firstString(item, ["price.currency", "currency"]) || null,
          price_text: firstString(item, ["price.formatted", "price.text"]) || null,
          rating: firstNumber(item, ["rating", "reviews.average_rating"]),
          reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["reviews.count"]) ?? 0)),
          opening_hours: null,
          tags: providerTags("getyourguide", "GetYourGuide", sourceUrl, {
            official_image_url: imageUrl,
            source_api_provider: "getyourguide-partner-api",
          }),
        }),
      ];
    });
}

async function fetchYelpRestaurants(context: ProviderContext): Promise<OfficialCatalogItem[]> {
  const apiKey = env("YELP_API_KEY");
  if (!apiKey || (!context.city && !context.country && context.latitude == null)) return [];
  const base = envBase("YELP_API_BASE_URL", "https://api.yelp.com/v3");
  const url = new URL(`${base}/businesses/search`);
  url.searchParams.set("categories", "restaurants");
  url.searchParams.set("locale", "fr_FR");
  url.searchParams.set("limit", String(Math.min(context.limit, 50)));
  url.searchParams.set("radius", String(Math.min(40_000, context.radiusMeters)));
  if (context.latitude != null && context.longitude != null) {
    url.searchParams.set("latitude", String(context.latitude));
    url.searchParams.set("longitude", String(context.longitude));
  } else {
    url.searchParams.set("location", areaText(context));
  }
  const json = await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return asArray(json)
    .slice(0, context.limit)
    .flatMap((item) => {
      const externalId = firstString(item, ["id", "alias"]);
      const title = firstString(item, ["name"]);
      const sourceUrl =
        firstHttps(item, ["url"]) ||
        googlePlacesSearchUrl({
          title,
          city: context.city,
          country: context.country,
        });
      if (!externalId || !title || !sourceUrl) return [];
      const imageUrl = firstHttps(item, ["image_url"]);
      if (!imageUrl) return [];
      return [
        officialItem({
          provider: "yelp-restaurants",
          external_id: externalId,
          kind: "restaurant",
          slug: `${slugify(title)}-yelp-${slugify(externalId).slice(-24)}`,
          title,
          description: null,
          category: "restaurant",
          city: context.city || firstString(item, ["location.city"]) || null,
          country: context.country || firstString(item, ["location.country"]) || null,
          country_code: firstString(item, ["location.country"]) || null,
          latitude: firstNumber(item, ["coordinates.latitude"]),
          longitude: firstNumber(item, ["coordinates.longitude"]),
          image_url: imageUrl,
          source_url: sourceUrl,
          booking_url: sourceUrl,
          price_amount: null,
          currency: null,
          price_text: firstString(item, ["price"]) || null,
          rating: firstNumber(item, ["rating"]),
          reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["review_count"]) ?? 0)),
          opening_hours: null,
          tags: providerTags("yelp-restaurants", "Yelp", sourceUrl, {
            official_image_url: imageUrl,
            source_api_provider: "yelp-fusion-api",
            cuisine: firstString(item, ["categories.0.title"]) || null,
          }),
        }),
      ];
    });
}

function wants(input: OfficialCatalogApiInput, kind: ProviderKind) {
  return !input.kinds?.length || input.kinds.includes(kind);
}

export async function fetchOfficialCatalogRows(
  input: OfficialCatalogApiInput,
): Promise<OfficialCatalogItem[]> {
  const context = providerContext(input);
  if (!context.city && !context.country && context.latitude == null) return [];
  const providers: Array<Promise<OfficialCatalogItem[]>> = [];
  if (wants(input, "hotel")) providers.push(fetchBookingHotels(context));
  if (wants(input, "activity")) {
    providers.push(fetchTripadvisorActivities(context));
    providers.push(fetchGetYourGuideActivities(context));
  }
  if (wants(input, "restaurant")) providers.push(fetchYelpRestaurants(context));
  const settled = await Promise.allSettled(providers);
  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
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
