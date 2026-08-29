import {
  catalogCoordinatesAreReliable,
  isReliableCatalogItem,
  trustedDirectCatalogImage,
} from "./catalog-reliability";

export type QualityCatalogItem = {
  id?: string;
  provider?: string | null;
  external_id?: string | null;
  kind: "activity" | "restaurant" | "hotel" | "deal";
  title: string;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  image_url?: string | null;
  source_url?: string | null;
  booking_url?: string | null;
  valid_until?: string | null;
  tags?: Record<string, unknown> | null;
};

export const CATALOG_QUALITY_VERSION = "catalog-quality-v1";

const PROVIDER_PRIORITY: Record<string, number> = {
  "google-places": 100,
  "google-maps": 100,
  "booking-com": 98,
  booking: 98,
  "booking.com": 98,
  getyourguide: 96,
  "get-your-guide": 96,
  ticketmaster: 96,
  tripadvisor: 94,
  "tripadvisor-attractions": 94,
  "tripadvisor-activities": 94,
  "tripadvisor-restaurants": 94,
  thefork: 92,
  opentable: 92,
  yelp: 90,
  "yelp-restaurants": 90,
  "uber-eats": 88,
  ubereats: 88,
  "globelink-curated": 78,
  openstreetmap: 70,
  "openstreetmap-live": 70,
  "openstreetmap-browser": 70,
};

function clean(value: unknown, max = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: unknown) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providerName(value: unknown) {
  return normalize(value).replace(/\s+/g, "-");
}

function tagBoolean(tags: Record<string, unknown> | null | undefined, key: string) {
  const value = tags?.[key];
  if (typeof value === "boolean") return value;
  return typeof value === "string" && /^(true|yes|1|verified)$/i.test(value.trim());
}

function tagText(tags: Record<string, unknown> | null | undefined, key: string) {
  const value = tags?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isExpired(value: string | null | undefined, now = Date.now()) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time < now;
}

function directImage(item: QualityCatalogItem) {
  return (
    trustedDirectCatalogImage(item, item.image_url) ??
    trustedDirectCatalogImage(item, tagText(item.tags, "official_image_url")) ??
    trustedDirectCatalogImage(item, tagText(item.tags, "provider_image_url"))
  );
}

export function sanitizeCatalogItem<T extends QualityCatalogItem>(item: T): T {
  const trustedImage = directImage(item);
  if ((item.image_url ?? null) === trustedImage) return item;
  return { ...item, image_url: trustedImage };
}

function locationKey(item: QualityCatalogItem) {
  return [normalize(item.city), normalize(item.country)].filter(Boolean).join("|");
}

function haversineMeters(a: QualityCatalogItem, b: QualityCatalogItem) {
  if (!catalogCoordinatesAreReliable(a) || !catalogCoordinatesAreReliable(b)) return Number.POSITIVE_INFINITY;
  const lat1 = Number(a.latitude) * Math.PI / 180;
  const lat2 = Number(b.latitude) * Math.PI / 180;
  const dLat = lat2 - lat1;
  const dLng = (Number(b.longitude) - Number(a.longitude)) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function titleKey(item: QualityCatalogItem) {
  return normalize(item.title)
    .replace(/\b(hotel|hôtel|restaurant|the|le|la|les|de|du|des)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogItemsDescribeSamePlace(a: QualityCatalogItem, b: QualityCatalogItem) {
  if (a.kind !== b.kind) return false;
  const aTitle = titleKey(a);
  const bTitle = titleKey(b);
  if (!aTitle || aTitle !== bTitle) return false;

  const distance = haversineMeters(a, b);
  if (distance <= 250) return true;

  const aLocation = locationKey(a);
  const bLocation = locationKey(b);
  return !!aLocation && aLocation === bLocation;
}

function qualityScore(item: QualityCatalogItem) {
  const provider = providerName(item.provider);
  let score = PROVIDER_PRIORITY[provider] ?? 40;
  if (tagBoolean(item.tags, "strict_official_source_verified")) score += 20;
  else if (tagBoolean(item.tags, "official_source_verified")) score += 15;
  else if (tagBoolean(item.tags, "verified_google_place")) score += 15;
  else if (tagBoolean(item.tags, "verified_real_place")) score += 8;
  if (catalogCoordinatesAreReliable(item)) score += 8;
  if (directImage(item)) score += 5;
  if (clean(item.booking_url)) score += 3;
  if (clean(item.source_url)) score += 2;
  return score;
}

export function catalogItemPassesPhase5(item: QualityCatalogItem, now = Date.now()) {
  if (!isReliableCatalogItem(item)) return false;
  if (isExpired(item.valid_until, now)) return false;
  if (item.kind !== "deal" && !clean(item.city) && !clean(item.country) && !catalogCoordinatesAreReliable(item)) {
    return false;
  }
  return true;
}

export function dedupeVerifiedCatalogItems<T extends QualityCatalogItem>(items: T[]): T[] {
  const accepted: T[] = [];
  for (const raw of items) {
    if (!catalogItemPassesPhase5(raw)) continue;
    const item = sanitizeCatalogItem(raw);
    const duplicateIndex = accepted.findIndex((candidate) => catalogItemsDescribeSamePlace(candidate, item));
    if (duplicateIndex < 0) {
      accepted.push(item);
      continue;
    }
    if (qualityScore(item) > qualityScore(accepted[duplicateIndex])) accepted[duplicateIndex] = item;
  }
  return accepted;
}

export function filterVerifiedMapCatalogItems<T extends QualityCatalogItem>(items: T[]) {
  return dedupeVerifiedCatalogItems(items).filter((item) => catalogCoordinatesAreReliable(item));
}
