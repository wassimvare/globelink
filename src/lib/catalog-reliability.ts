export type ReliableCatalogKind = "activity" | "restaurant" | "hotel" | "deal";

type CatalogReliabilityItem = {
  provider?: string | null;
  kind: ReliableCatalogKind;
  title: string;
  category?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  source_url?: string | null;
  booking_url?: string | null;
  tags?: Record<string, unknown> | null;
};

export type CatalogReliabilityReason =
  | "ok"
  | "title_missing"
  | "title_placeholder"
  | "coordinates_missing"
  | "coordinates_invalid"
  | "source_missing"
  | "source_untrusted"
  | "provider_unverified";

const PLACEHOLDER_TITLES = new Set([
  "unknown",
  "inconnu",
  "sans nom",
  "sans-nom",
  "unnamed",
  "n/a",
  "na",
  "null",
  "undefined",
  "test",
]);

const OFFICIAL_SOURCE_HOSTS: Record<string, RegExp[]> = {
  booking: [/(^|\.)booking\.[a-z.]+$/i],
  "booking-com": [/(^|\.)booking\.[a-z.]+$/i],
  "booking.com": [/(^|\.)booking\.[a-z.]+$/i],
  "google-places": [/(^|\.)google\.[a-z.]+$/i, /(^|\.)googleapis\.com$/i],
  "google-maps": [/(^|\.)google\.[a-z.]+$/i, /(^|\.)googleapis\.com$/i],
  getyourguide: [/(^|\.)getyourguide\.[a-z.]+$/i],
  "get-your-guide": [/(^|\.)getyourguide\.[a-z.]+$/i],
  tripadvisor: [/(^|\.)tripadvisor\.[a-z.]+$/i],
  "tripadvisor-attractions": [/(^|\.)tripadvisor\.[a-z.]+$/i],
  "tripadvisor-activities": [/(^|\.)tripadvisor\.[a-z.]+$/i],
  "tripadvisor-restaurants": [/(^|\.)tripadvisor\.[a-z.]+$/i],
  yelp: [/(^|\.)yelp\.[a-z.]+$/i],
  "yelp-restaurants": [/(^|\.)yelp\.[a-z.]+$/i],
  thefork: [/(^|\.)thefork\.[a-z.]+$/i],
  opentable: [/(^|\.)opentable\.[a-z.]+$/i],
  "uber-eats": [/(^|\.)ubereats\.com$/i, /(^|\.)uber\.com$/i],
  ubereats: [/(^|\.)ubereats\.com$/i, /(^|\.)uber\.com$/i],
};

const OFFICIAL_IMAGE_HOSTS: Record<string, RegExp[]> = {
  booking: [/(^|\.)bstatic\.com$/i, /(^|\.)booking\.[a-z.]+$/i],
  "booking-com": [/(^|\.)bstatic\.com$/i, /(^|\.)booking\.[a-z.]+$/i],
  "booking.com": [/(^|\.)bstatic\.com$/i, /(^|\.)booking\.[a-z.]+$/i],
  "google-places": [
    /(^|\.)googleusercontent\.com$/i,
    /(^|\.)gstatic\.com$/i,
    /(^|\.)googleapis\.com$/i,
    /(^|\.)google\.[a-z.]+$/i,
  ],
  "google-maps": [
    /(^|\.)googleusercontent\.com$/i,
    /(^|\.)gstatic\.com$/i,
    /(^|\.)googleapis\.com$/i,
    /(^|\.)google\.[a-z.]+$/i,
  ],
  getyourguide: [/(^|\.)getyourguide\.[a-z.]+$/i, /(^|\.)cdn\.getyourguide\.com$/i],
  "get-your-guide": [/(^|\.)getyourguide\.[a-z.]+$/i, /(^|\.)cdn\.getyourguide\.com$/i],
  tripadvisor: [/(^|\.)tripadvisormedia\.com$/i, /(^|\.)tripadvisorcdn\.com$/i],
  "tripadvisor-attractions": [/(^|\.)tripadvisormedia\.com$/i, /(^|\.)tripadvisorcdn\.com$/i],
  "tripadvisor-activities": [/(^|\.)tripadvisormedia\.com$/i, /(^|\.)tripadvisorcdn\.com$/i],
  "tripadvisor-restaurants": [/(^|\.)tripadvisormedia\.com$/i, /(^|\.)tripadvisorcdn\.com$/i],
  yelp: [/(^|\.)yelpcdn\.com$/i],
  "yelp-restaurants": [/(^|\.)yelpcdn\.com$/i],
};

const BLOCKED_GENERIC_IMAGE_HOSTS = [
  /(^|\.)unsplash\.com$/i,
  /(^|\.)pexels\.com$/i,
  /(^|\.)pixabay\.com$/i,
  /(^|\.)picsum\.photos$/i,
  /(^|\.)placehold\.co$/i,
  /(^|\.)placeholder\.com$/i,
];

const OPEN_KNOWLEDGE_HOSTS = [
  /(^|\.)openstreetmap\.org$/i,
  /(^|\.)wikidata\.org$/i,
  /(^|\.)wikipedia\.org$/i,
  /(^|\.)wikimedia\.org$/i,
];

const OPEN_KNOWLEDGE_IMAGE_HOSTS = [
  /(^|\.)upload\.wikimedia\.org$/i,
  /(^|\.)commons\.wikimedia\.org$/i,
  /(^|\.)wikipedia\.org$/i,
];

function clean(value: unknown, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: unknown) {
  return clean(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeProvider(value: unknown) {
  return normalize(value).replace(/_/g, "-").replace(/\s+/g, "-");
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

function safeHttps(value: unknown): URL | null {
  try {
    const url = new URL(clean(value, 2_500));
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function matchesAny(hostname: string, rules: RegExp[]) {
  return rules.some((rule) => rule.test(hostname));
}

function isOsmProvider(provider: string) {
  return provider === "openstreetmap" || provider === "openstreetmap-live" || provider === "openstreetmap-browser";
}

function isOfficialProvider(provider: string) {
  return Object.prototype.hasOwnProperty.call(OFFICIAL_SOURCE_HOSTS, provider);
}

function validCoordinatePair(latitude: unknown, longitude: unknown) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // 0,0 is a common upstream fallback and should never become a travel POI marker.
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  return true;
}

export function catalogCoordinatesAreReliable(
  item: Pick<CatalogReliabilityItem, "latitude" | "longitude">,
) {
  return validCoordinatePair(item.latitude, item.longitude);
}

function coordinateState(item: Pick<CatalogReliabilityItem, "latitude" | "longitude">) {
  const latMissing = item.latitude == null;
  const lngMissing = item.longitude == null;
  if (latMissing && lngMissing) return "missing" as const;
  if (latMissing !== lngMissing) return "invalid" as const;
  return validCoordinatePair(item.latitude, item.longitude) ? ("valid" as const) : ("invalid" as const);
}

function trustedOsmSource(value: unknown) {
  const url = safeHttps(value);
  if (!url || !/(^|\.)openstreetmap\.org$/i.test(url.hostname)) return false;
  return /^\/(node|way|relation)\/\d+(?:[/?#]|$)/i.test(url.pathname + url.search + url.hash);
}

function trustedProviderUrl(provider: string, value: unknown) {
  const url = safeHttps(value);
  if (!url) return false;
  const rules = OFFICIAL_SOURCE_HOSTS[provider];
  return !!rules && matchesAny(url.hostname, rules);
}

function trustedKnowledgeUrl(value: unknown) {
  const url = safeHttps(value);
  return !!url && matchesAny(url.hostname, OPEN_KNOWLEDGE_HOSTS);
}

function sourceVerifiedByTags(item: CatalogReliabilityItem) {
  const tags = item.tags ?? null;
  return (
    tagBoolean(tags, "official_source_verified") ||
    tagBoolean(tags, "strict_official_source_verified") ||
    tagBoolean(tags, "provider_verified") ||
    tagBoolean(tags, "verified_real_place")
  );
}

function googlePlaceProof(item: CatalogReliabilityItem) {
  const tags = item.tags ?? null;
  return (
    tagBoolean(tags, "verified_google_place") &&
    !!(tagText(tags, "google_place_id") || tagText(tags, "google_photo_name"))
  );
}

function curatedProof(item: CatalogReliabilityItem) {
  const tags = item.tags ?? null;
  return (
    tagBoolean(tags, "curated_country_activity") ||
    tagBoolean(tags, "verified_real_place") ||
    !!tagText(tags, "wikidata") ||
    !!tagText(tags, "wikipedia") ||
    !!tagText(tags, "wikimedia_commons")
  );
}

function hasLocationLabel(item: CatalogReliabilityItem) {
  return !!clean(item.city, 100) || !!clean(item.country, 100);
}

export function catalogReliabilityReason(item: CatalogReliabilityItem): CatalogReliabilityReason {
  const title = clean(item.title, 180);
  if (!title) return "title_missing";
  if (PLACEHOLDER_TITLES.has(normalize(title))) return "title_placeholder";

  const coordinates = coordinateState(item);
  if (coordinates === "invalid") return "coordinates_invalid";

  const provider = normalizeProvider(item.provider);
  if (item.kind === "deal") {
    return safeHttps(item.booking_url) || safeHttps(item.source_url) ? "ok" : "source_missing";
  }

  if (isOsmProvider(provider)) {
    if (coordinates !== "valid") return "coordinates_missing";
    return trustedOsmSource(item.source_url) ? "ok" : "source_untrusted";
  }

  if (provider === "globelink-curated") {
    if (!curatedProof(item)) return "provider_unverified";
    if (coordinates === "missing" && !hasLocationLabel(item)) return "coordinates_missing";
    if (
      trustedKnowledgeUrl(item.source_url) ||
      trustedOsmSource(item.source_url) ||
      sourceVerifiedByTags(item)
    ) {
      return "ok";
    }
    return "source_untrusted";
  }

  if (provider === "google-places" || provider === "google-maps") {
    if (coordinates === "missing" && !hasLocationLabel(item)) return "coordinates_missing";
    if (trustedProviderUrl(provider, item.source_url) || googlePlaceProof(item)) return "ok";
    return "provider_unverified";
  }

  if (isOfficialProvider(provider)) {
    if (coordinates === "missing" && !hasLocationLabel(item)) return "coordinates_missing";
    if (
      trustedProviderUrl(provider, item.source_url) ||
      trustedProviderUrl(provider, item.booking_url)
    ) {
      return "ok";
    }
    return "source_untrusted";
  }

  // Unknown/search-derived providers must carry explicit server-side verification
  // and a concrete HTTPS source. Coordinates alone are no longer sufficient proof.
  if (!sourceVerifiedByTags(item)) return "provider_unverified";
  if (coordinates === "missing" && !hasLocationLabel(item)) return "coordinates_missing";
  if (!safeHttps(item.source_url) && !safeHttps(item.booking_url)) return "source_missing";
  return "ok";
}

export function isReliableCatalogItem(item: CatalogReliabilityItem) {
  return catalogReliabilityReason(item) === "ok";
}

export function filterReliableCatalogItems<T extends CatalogReliabilityItem>(items: T[]) {
  return items.filter((item) => isReliableCatalogItem(item));
}

export function isReliableMapCatalogItem(item: CatalogReliabilityItem) {
  return isReliableCatalogItem(item) && catalogCoordinatesAreReliable(item);
}

export function filterReliableMapCatalogItems<T extends CatalogReliabilityItem>(items: T[]) {
  return items.filter((item) => isReliableMapCatalogItem(item));
}

function sameHostFamily(left: URL, right: URL) {
  const a = left.hostname.replace(/^www\./i, "").toLowerCase();
  const b = right.hostname.replace(/^www\./i, "").toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function trustedOpenKnowledgeImage(url: URL, item: CatalogReliabilityItem) {
  if (!matchesAny(url.hostname, OPEN_KNOWLEDGE_IMAGE_HOSTS)) return false;
  const tags = item.tags ?? null;
  return (
    isOsmProvider(normalizeProvider(item.provider)) ||
    !!tagText(tags, "wikidata") ||
    !!tagText(tags, "wikipedia") ||
    !!tagText(tags, "wikimedia_commons") ||
    tagBoolean(tags, "verified_real_place")
  );
}

export function trustedDirectCatalogImage(
  item: CatalogReliabilityItem,
  value: unknown,
): string | null {
  const url = safeHttps(value);
  if (!url) return null;
  if (matchesAny(url.hostname, BLOCKED_GENERIC_IMAGE_HOSTS)) return null;

  const provider = normalizeProvider(item.provider);
  const providerRules = OFFICIAL_IMAGE_HOSTS[provider];
  if (providerRules && matchesAny(url.hostname, providerRules)) return url.toString();
  if (trustedOpenKnowledgeImage(url, item)) return url.toString();

  const tags = item.tags ?? null;
  if (sourceVerifiedByTags(item)) {
    const sourceCandidates = [
      tagText(tags, "official_website"),
      tagText(tags, "website"),
      tagText(tags, "official_source_url"),
      item.source_url,
    ];
    for (const source of sourceCandidates) {
      const sourceUrl = safeHttps(source);
      if (sourceUrl && sameHostFamily(url, sourceUrl)) return url.toString();
    }
  }

  // For OSM/open-data rows, arbitrary external image tags are intentionally ignored.
  // CatalogImage will resolve Google Places, Wikimedia or the verified official site instead.
  return null;
}
