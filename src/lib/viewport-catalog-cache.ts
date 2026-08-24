import type { LiveCatalogItem } from "./live-catalog";

export type CatalogViewportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom: number;
};

type CacheEntry = {
  key: string;
  savedAt: number;
  bounds: CatalogViewportBounds;
  rows: LiveCatalogItem[];
};

const STORAGE_KEY = "globelink:viewport-catalog:v1";
const MAX_ENTRIES = 6;
const MAX_ROWS_PER_ENTRY = 280;
const CACHE_TTL = 12 * 60 * 60_000;

export function catalogIdentityKey(
  item: Pick<LiveCatalogItem, "provider" | "external_id">,
): string {
  const provider = String(item.provider ?? "").toLowerCase();
  if (provider.startsWith("openstreetmap")) return `osm:${item.external_id}`;
  return `${provider}:${item.external_id}`;
}

function entryKey(bounds: CatalogViewportBounds) {
  const midLat = (bounds.south + bounds.north) / 2;
  const midLng = (bounds.west + bounds.east) / 2;
  const zoomBucket = Math.max(2, Math.min(19, Math.round(bounds.zoom)));
  return `${midLat.toFixed(2)}:${midLng.toFixed(2)}:${zoomBucket}`;
}

function readEntries(): CacheEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as CacheEntry[];
    const now = Date.now();
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) =>
            entry &&
            Number.isFinite(entry.savedAt) &&
            now - entry.savedAt <= CACHE_TTL &&
            Array.isArray(entry.rows),
        )
      : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: CacheEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage can be unavailable (private mode/quota). The live map still works.
  }
}

function insideViewport(
  item: Pick<LiveCatalogItem, "latitude" | "longitude">,
  bounds: CatalogViewportBounds,
  padding = 0.08,
) {
  if (item.latitude == null || item.longitude == null) return false;
  const latPad = Math.max(0.01, (bounds.north - bounds.south) * padding);
  const lngPad = Math.max(0.01, (bounds.east - bounds.west) * padding);
  return (
    item.latitude >= bounds.south - latPad &&
    item.latitude <= bounds.north + latPad &&
    item.longitude >= bounds.west - lngPad &&
    item.longitude <= bounds.east + lngPad
  );
}

function compactRow(item: LiveCatalogItem): LiveCatalogItem {
  const tags = item.tags ?? {};
  const keepTag = (key: string) =>
    Object.prototype.hasOwnProperty.call(tags, key) ? tags[key] : undefined;
  const compactTags: Record<string, unknown> = {};
  for (const key of [
    "amenity",
    "tourism",
    "leisure",
    "natural",
    "shop",
    "cuisine",
    "image",
    "wikimedia_commons",
    "wikidata",
    "wikipedia",
    "website",
    "phone",
    "original_kind",
    "map_offer_fallback",
    "location_precision",
  ]) {
    const value = keepTag(key);
    if (value !== undefined && value !== null && value !== "") compactTags[key] = value;
  }
  return { ...item, tags: Object.keys(compactTags).length ? compactTags : null };
}

export function getCachedViewportCatalog(bounds: CatalogViewportBounds): LiveCatalogItem[] {
  const seen = new Set<string>();
  const rows: LiveCatalogItem[] = [];
  for (const entry of readEntries().sort((a, b) => b.savedAt - a.savedAt)) {
    for (const item of entry.rows) {
      if (!insideViewport(item, bounds)) continue;
      const key = catalogIdentityKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
      if (rows.length >= 450) return rows;
    }
  }
  return rows;
}

export function saveCachedViewportCatalog(
  bounds: CatalogViewportBounds,
  incomingRows: LiveCatalogItem[],
) {
  if (typeof window === "undefined" || !incomingRows.length) return;
  const seen = new Set<string>();
  const rows = incomingRows
    .filter((item) => insideViewport(item, bounds, 0.18))
    .filter((item) => {
      const key = catalogIdentityKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ROWS_PER_ENTRY)
    .map(compactRow);
  if (!rows.length) return;

  const key = entryKey(bounds);
  const entries = readEntries().filter((entry) => entry.key !== key);
  entries.unshift({ key, savedAt: Date.now(), bounds, rows });
  writeEntries(entries);
}
