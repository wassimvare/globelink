export type CatalogSourceKind = "activity" | "restaurant" | "hotel" | "deal";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type RoutableCatalogItem = {
  provider?: string | null;
  kind: CatalogSourceKind;
  title: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  booking_url?: string | null;
  source_url?: string | null;
  tags?: Record<string, unknown> | null;
};

type CatalogSource = {
  provider: string;
  label: string;
  url: string;
};

export type CatalogSourceRoute = {
  primary: CatalogSource;
  reservation: CatalogSource;
  secondary: CatalogSource[];
  apiEnvVars: string[];
  cacheTtlMs: number;
  photoPriority: string[];
};

export const SPECIALIZED_SOURCE_VERSION = "specialized-sources-v1";
export const STRICT_OFFICIAL_SOURCE_VERSION = "strict-official-sources-v1";
export const TRUSTED_VISIBLE_SOURCE_VERSION = "trusted-visible-sources-v1";

const DAY_MS = 24 * 60 * 60_000;
const SPECIALIZED_HOSTS =
  /(^|\.)((booking|tripadvisor|getyourguide|yelp|thefork|opentable)\.[a-z.]+)$/i;
const SEARCH_ONLY_PROVIDERS = new Set([
  "openstreetmap",
  "openstreetmap-live",
  "openstreetmap-browser",
  "globelink-curated",
  "tavily",
]);
const OFFICIAL_SOURCE_PROVIDERS: Record<Exclude<CatalogSourceKind, "deal">, Set<string>> = {
  hotel: new Set(["google-places", "google-maps"]),
  restaurant: new Set(["google-places", "google-maps"]),
  activity: new Set(["google-places", "google-maps", "ticketmaster"]),
};
const OFFICIAL_IMAGE_HOSTS: Record<string, RegExp> = {
  ticketmaster: /(^|\.)ticketm\.net$|(^|\.)ticketmaster\.[a-z.]+$/i,
  "booking-com": /(^|\.)bstatic\.com$|(^|\.)booking\.com$/i,
  booking: /(^|\.)bstatic\.com$|(^|\.)booking\.com$/i,
  "booking.com": /(^|\.)bstatic\.com$|(^|\.)booking\.com$/i,
  getyourguide: /(^|\.)getyourguide\.[a-z.]+$|(^|\.)cdn\.getyourguide\.com$/i,
  "get-your-guide": /(^|\.)getyourguide\.[a-z.]+$|(^|\.)cdn\.getyourguide\.com$/i,
  tripadvisor:
    /(^|\.)tripadvisor\.[a-z.]+$|(^|\.)tripadvisormedia\.com$|(^|\.)tripadvisorcdn\.com$/i,
  "tripadvisor-attractions":
    /(^|\.)tripadvisor\.[a-z.]+$|(^|\.)tripadvisormedia\.com$|(^|\.)tripadvisorcdn\.com$/i,
  "tripadvisor-activities":
    /(^|\.)tripadvisor\.[a-z.]+$|(^|\.)tripadvisormedia\.com$|(^|\.)tripadvisorcdn\.com$/i,
  "tripadvisor-restaurants":
    /(^|\.)tripadvisor\.[a-z.]+$|(^|\.)tripadvisormedia\.com$|(^|\.)tripadvisorcdn\.com$/i,
  yelp: /(^|\.)yelp\.[a-z.]+$|(^|\.)yelpcdn\.com$/i,
  "yelp-restaurants": /(^|\.)yelp\.[a-z.]+$|(^|\.)yelpcdn\.com$/i,
  thefork: /(^|\.)thefork\.[a-z.]+$/i,
  opentable: /(^|\.)opentable\.[a-z.]+$/i,
  "uber-eats": /(^|\.)ubereats\.com$|(^|\.)uber\.com$/i,
  ubereats: /(^|\.)ubereats\.com$|(^|\.)uber\.com$/i,
};
const BLOCKED_VISIBLE_CATEGORIES = new Set([
  "atm",
  "bar",
  "distributeur",
  "nightclub",
  "pharmacie",
  "pharmacy",
  "pub",
  "vie-nocturne",
  "vie_nocturne",
]);
const ACTIVITY_CATEGORIES = new Set([
  "activite",
  "activité",
  "attraction",
  "cascade",
  "event",
  "gallery",
  "musee",
  "musée",
  "park",
  "plage",
  "shopping",
]);

function clean(value: unknown, max = 180) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tagText(tags: Record<string, unknown> | null | undefined, key: string) {
  const value = tags?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function tagBoolean(tags: Record<string, unknown> | null | undefined, key: string) {
  const value = tags?.[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|1|verified)$/i.test(value.trim());
  return false;
}

function normalizeProvider(value: unknown) {
  return clean(value, 80).toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function normalizeCategory(value: unknown) {
  return clean(value, 80)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function itemCategory(
  item: Pick<RoutableCatalogItem, "kind" | "category" | "tags">,
): string | null {
  return (
    normalizeCategory(item.category) ||
    normalizeCategory(tagText(item.tags, "category")) ||
    normalizeCategory(tagText(item.tags, "amenity")) ||
    normalizeCategory(tagText(item.tags, "tourism")) ||
    normalizeCategory(tagText(item.tags, "leisure")) ||
    normalizeCategory(tagText(item.tags, "natural")) ||
    (item.kind === "activity" &&
    (tagText(item.tags, "wikidata") ||
      tagText(item.tags, "wikipedia") ||
      tagBoolean(item.tags, "verified_real_place") ||
      tagBoolean(item.tags, "curated_country_activity"))
      ? "activite"
      : null) ||
    (item.kind === "restaurant" ? "restaurant" : item.kind === "hotel" ? "hotel" : null)
  );
}

function hasUsableCoordinates(item: Pick<RoutableCatalogItem, "latitude" | "longitude">) {
  return Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
}

function hasKnownPlaceProof(
  item: Pick<RoutableCatalogItem, "source_url" | "tags" | "latitude" | "longitude">,
) {
  return (
    hasUsableCoordinates(item) ||
    !!safeHttps(item.source_url) ||
    !!tagText(item.tags, "wikidata") ||
    !!tagText(item.tags, "wikipedia") ||
    !!tagText(item.tags, "wikimedia_commons")
  );
}

function isSpecializedUrl(value: string | null | undefined) {
  const url = safeHttps(value);
  if (!url) return false;
  try {
    return SPECIALIZED_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function providerFromItem(item: Pick<RoutableCatalogItem, "provider" | "tags">) {
  const tags = item.tags ?? null;
  return normalizeProvider(
    item.provider ||
      tagText(tags, "official_source_provider") ||
      tagText(tags, "verified_source_provider") ||
      tagText(tags, "strict_source_provider") ||
      tagText(tags, "primary_source_provider") ||
      tagText(tags, "provider"),
  );
}

function officialProviderForKind(provider: string, kind: CatalogSourceKind) {
  if (kind === "deal") return false;
  return OFFICIAL_SOURCE_PROVIDERS[kind].has(provider);
}

function officialSourceUrl(
  item: Pick<RoutableCatalogItem, "kind" | "provider" | "source_url" | "booking_url" | "tags">,
  provider: string,
) {
  const candidates = [
    item.source_url,
    item.booking_url,
    tagText(item.tags, "official_source_url"),
    tagText(item.tags, "provider_source_url"),
    tagText(item.tags, "reservation_source_url"),
  ];
  const matcher = OFFICIAL_IMAGE_HOSTS[provider];
  if (!matcher) return candidates.some((value) => !!safeHttps(value));
  return candidates.some((value) => {
    const url = safeHttps(value);
    if (!url) return false;
    try {
      return matcher.test(new URL(url).hostname);
    } catch {
      return false;
    }
  });
}

function officialImageUrl(
  item: Pick<RoutableCatalogItem, "provider" | "image_url" | "tags">,
  provider: string,
) {
  const candidates = [
    item.image_url,
    tagText(item.tags, "official_image_url"),
    tagText(item.tags, "provider_image_url"),
    tagText(item.tags, "image"),
  ];
  const matcher = OFFICIAL_IMAGE_HOSTS[provider];
  for (const value of candidates) {
    const url = safeHttps(value);
    if (!url) continue;
    try {
      const hostname = new URL(url).hostname;
      if (matcher?.test(hostname)) return url;
    } catch {
      continue;
    }
  }
  return null;
}

export function isSearchOnlyCatalogSource(item: Pick<RoutableCatalogItem, "provider" | "tags">) {
  const tags = item.tags ?? null;
  const provider = normalizeProvider(item.provider);
  return (
    tagBoolean(tags, "source_is_search_only") ||
    (tagText(tags, "source_strategy") === SPECIALIZED_SOURCE_VERSION &&
      (SEARCH_ONLY_PROVIDERS.has(provider) || provider === ""))
  );
}

export function catalogVerificationReason(
  item: Pick<
    RoutableCatalogItem,
    "kind" | "provider" | "image_url" | "source_url" | "booking_url" | "tags"
  >,
) {
  const tags = item.tags ?? null;
  const provider = providerFromItem(item);
  if (item.kind === "deal") return "deal";
  if (!officialProviderForKind(provider, item.kind)) return "source_non_autorisee";
  if (isSearchOnlyCatalogSource(item)) return "lien_de_recherche_non_verifie";
  const googleVerified =
    (provider === "google-places" || provider === "google-maps") &&
    ["activity", "hotel", "restaurant"].includes(item.kind) &&
    tagBoolean(tags, "verified_google_place") &&
    !!tagText(tags, "google_photo_name");
  const providerVerified =
    tagBoolean(tags, "official_source_verified") ||
    tagBoolean(tags, "strict_official_source_verified") ||
    tagBoolean(tags, "provider_verified") ||
    (!SEARCH_ONLY_PROVIDERS.has(normalizeProvider(item.provider)) &&
      officialSourceUrl(item, provider));
  if (!googleVerified && !providerVerified) return "source_pas_verifiee";
  if (!tagText(tags, "google_photo_name") && !officialImageUrl(item, provider)) {
    return "photo_officielle_manquante";
  }
  return "source_officielle_verifiee";
}

export function isStrictOfficialCatalogItem(
  item: Pick<
    RoutableCatalogItem,
    "kind" | "provider" | "image_url" | "source_url" | "booking_url" | "tags"
  >,
) {
  if (item.kind === "deal") return !isSearchOnlyCatalogSource(item);
  return catalogVerificationReason(item) === "source_officielle_verifiee";
}

export function filterStrictOfficialCatalogItems<T extends RoutableCatalogItem>(items: T[]) {
  return items.filter((item) => isStrictOfficialCatalogItem(item));
}

export function isTrustedVisibleCatalogItem(
  item: Pick<
    RoutableCatalogItem,
    | "kind"
    | "provider"
    | "title"
    | "category"
    | "image_url"
    | "source_url"
    | "booking_url"
    | "latitude"
    | "longitude"
    | "tags"
  >,
) {
  if (isStrictOfficialCatalogItem(item)) return true;
  if (item.kind === "deal") return !isSearchOnlyCatalogSource(item);
  if (!["activity", "hotel", "restaurant"].includes(item.kind)) return false;
  if (clean(item.title, 120).length < 2) return false;

  const category = itemCategory(item);
  if (!category || BLOCKED_VISIBLE_CATEGORIES.has(category)) return false;
  if (!hasKnownPlaceProof(item)) return false;

  if (item.kind === "restaurant") {
    return ["restaurant", "cafe", "fast-food", "food-court", "ice-cream"].includes(category);
  }
  if (item.kind === "hotel") {
    return ["hotel", "hostel", "guest-house", "motel", "resort", "apartment", "camp-site"].includes(
      category,
    );
  }
  if (
    tagBoolean(item.tags, "verified_real_place") ||
    tagBoolean(item.tags, "curated_country_activity")
  ) {
    return true;
  }
  return ACTIVITY_CATEGORIES.has(category) || !!tagText(item.tags, "wikidata");
}

export function filterTrustedVisibleCatalogItems<T extends RoutableCatalogItem>(items: T[]) {
  return items.filter((item) => isTrustedVisibleCatalogItem(item));
}

function searchText(item: Pick<RoutableCatalogItem, "title" | "city" | "country">) {
  return [item.title, item.city, item.country]
    .map((value) => clean(value, 100))
    .filter(Boolean)
    .join(", ");
}

function areaText(item: Pick<RoutableCatalogItem, "city" | "country">) {
  return [item.city, item.country]
    .map((value) => clean(value, 100))
    .filter(Boolean)
    .join(", ");
}

function urlWithParams(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value.trim()) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function bookingHotelUrl(item: Pick<RoutableCatalogItem, "title" | "city" | "country">) {
  return urlWithParams("https://www.booking.com/searchresults.fr.html", {
    ss: searchText(item),
    group_adults: "2",
    no_rooms: "1",
    group_children: "0",
  });
}

export function getYourGuideActivityUrl(
  item: Pick<RoutableCatalogItem, "title" | "city" | "country">,
) {
  return urlWithParams("https://www.getyourguide.fr/s/", { q: searchText(item) });
}

export function tripadvisorSearchUrl(
  item: Pick<RoutableCatalogItem, "title" | "city" | "country">,
  prefix = "",
) {
  return urlWithParams("https://www.tripadvisor.fr/Search", {
    q: [prefix, searchText(item)].filter(Boolean).join(" "),
  });
}

export function yelpRestaurantUrl(item: Pick<RoutableCatalogItem, "title" | "city" | "country">) {
  return urlWithParams("https://www.yelp.com/search", {
    find_desc: ["Restaurants", clean(item.title, 90)].filter(Boolean).join(" "),
    find_loc: areaText(item) || searchText(item),
  });
}

export function uberEatsRestaurantUrl(
  item: Pick<RoutableCatalogItem, "title" | "city" | "country">,
) {
  return urlWithParams("https://www.ubereats.com/search", {
    q: searchText(item),
  });
}

export function googlePlacesSearchUrl(
  item: Pick<RoutableCatalogItem, "title" | "city" | "country">,
) {
  return urlWithParams("https://www.google.com/maps/search/", {
    api: "1",
    query: searchText(item),
  });
}

export function specializedSourceRoute(
  item: Pick<RoutableCatalogItem, "kind" | "title" | "city" | "country">,
): CatalogSourceRoute | null {
  const google = googlePlacesSearchUrl(item);

  if (item.kind === "hotel") {
    return {
      primary: { provider: "google-places", label: "Google Places", url: google },
      reservation: { provider: "google-places", label: "Google Places", url: google },
      secondary: [],
      apiEnvVars: ["GOOGLE_PLACES_API_KEY"],
      cacheTtlMs: 15 * 60_000,
      photoPriority: ["google-places", "official-site", "wikimedia"],
    };
  }

  if (item.kind === "restaurant") {
    return {
      primary: { provider: "google-places", label: "Google Places", url: google },
      reservation: { provider: "google-places", label: "Google Places", url: google },
      secondary: [],
      apiEnvVars: ["GOOGLE_PLACES_API_KEY"],
      cacheTtlMs: 15 * 60_000,
      photoPriority: ["google-places", "official-site", "wikimedia"],
    };
  }

  if (item.kind === "activity") {
    return {
      primary: { provider: "google-places", label: "Google Places", url: google },
      reservation: { provider: "google-places", label: "Google Places", url: google },
      secondary: [],
      apiEnvVars: ["GOOGLE_PLACES_API_KEY", "TICKETMASTER_API_KEY"],
      cacheTtlMs: 15 * 60_000,
      photoPriority: ["google-places", "official-site", "wikimedia"],
    };
  }

  return null;
}

function sourceToJson(source: CatalogSource): JsonValue {
  return { provider: source.provider, label: source.label, url: source.url };
}

function toJsonValue(value: unknown, depth = 0): JsonValue | undefined {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (depth > 4) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((entry) => toJsonValue(entry, depth + 1))
      .filter((entry): entry is JsonValue => entry !== undefined);
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const json = toJsonValue(entry, depth + 1);
      if (json !== undefined) result[key] = json;
    }
    return result;
  }
  return undefined;
}

function jsonTags(tags: Record<string, unknown> | null | undefined): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(tags ?? {})) {
    const json = toJsonValue(value);
    if (json !== undefined) result[key] = json;
  }
  return result;
}

export function enrichSpecializedCatalogSource<T extends RoutableCatalogItem>(item: T): T {
  const route = specializedSourceRoute(item);
  if (!route) return item;

  const rawBookingUrl = safeHttps(item.booking_url);
  const rawSourceUrl = safeHttps(item.source_url);
  const tags = jsonTags(item.tags);
  const itemProvider = normalizeProvider(item.provider);
  const sourceIsSearchOnly = !itemProvider || SEARCH_ONLY_PROVIDERS.has(itemProvider);
  if (!sourceIsSearchOnly) {
    return {
      ...item,
      booking_url: rawBookingUrl ?? item.booking_url,
      source_url: rawSourceUrl ?? item.source_url,
      tags: {
        ...tags,
        strict_source_policy: STRICT_OFFICIAL_SOURCE_VERSION,
        trusted_visible_policy: TRUSTED_VISIBLE_SOURCE_VERSION,
        source_is_search_only: tagBoolean(tags, "source_is_search_only"),
        source_verification_status:
          tagText(tags, "source_verification_status") ?? "provider_row_requires_strict_filter",
        google_places_url: googlePlacesSearchUrl(item),
      },
    };
  }
  const bookingUrl = isSpecializedUrl(rawBookingUrl) ? rawBookingUrl : route.reservation.url;
  const officialWebsite = isSpecializedUrl(rawBookingUrl) ? null : rawBookingUrl;

  return {
    ...item,
    booking_url: bookingUrl,
    source_url: rawSourceUrl ?? route.primary.url,
    tags: {
      ...tags,
      source_strategy: SPECIALIZED_SOURCE_VERSION,
      strict_source_policy: STRICT_OFFICIAL_SOURCE_VERSION,
      trusted_visible_policy: TRUSTED_VISIBLE_SOURCE_VERSION,
      source_is_search_only: true,
      official_source_verified: false,
      source_verification_status: "search_link_only",
      primary_source_provider: route.primary.provider,
      primary_source_label: route.primary.label,
      primary_source_url: route.primary.url,
      reservation_source_provider: route.reservation.provider,
      reservation_source_label: route.reservation.label,
      reservation_source_url: route.reservation.url,
      secondary_sources: route.secondary.map(sourceToJson),
      photo_source_priority: route.photoPriority,
      source_cache_ttl_ms: route.cacheTtlMs,
      source_api_env_vars: route.apiEnvVars,
      raw_source_url: rawSourceUrl,
      raw_booking_url: rawBookingUrl,
      official_website: officialWebsite ?? (typeof tags.website === "string" ? tags.website : null),
      google_places_url: googlePlacesSearchUrl(item),
    },
  };
}

export function specializedSourceLabel(
  item: Pick<RoutableCatalogItem, "kind" | "title" | "city" | "country" | "tags">,
) {
  const tagLabel = item.tags?.primary_source_label;
  const label =
    typeof tagLabel === "string" && tagLabel.trim()
      ? tagLabel.trim()
      : specializedSourceRoute(item)?.primary.label;
  if (!label) return null;
  if (isSearchOnlyCatalogSource(item)) return `${label} à vérifier`;
  return label;
}

export function specializedReservationLabel(
  item: Pick<RoutableCatalogItem, "kind" | "title" | "city" | "country" | "tags">,
) {
  const tagLabel = item.tags?.reservation_source_label;
  const label =
    typeof tagLabel === "string" && tagLabel.trim()
      ? tagLabel.trim()
      : specializedSourceRoute(item)?.reservation.label;
  if (!label) return null;
  if (isSearchOnlyCatalogSource(item)) return `Vérifier sur ${label}`;
  if (item.kind === "hotel") return `Voir sur ${label}`;
  if (item.kind === "restaurant") return `Voir les restaurants sur ${label}`;
  if (item.kind === "activity") return `Voir sur ${label}`;
  return `Voir sur ${label}`;
}
