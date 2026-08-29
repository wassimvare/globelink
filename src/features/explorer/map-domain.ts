import { PLACE_CATEGORIES } from "@/lib/countries";
import {
  fetchLiveCatalog,
  type LiveCatalogItem,
  type LiveCatalogKind,
} from "@/lib/live-catalog";
import type { AccountSettings } from "@/lib/account-settings";

export type AnyPlace = {
  id: string;
  name: string;
  category: string;
  country: string;
  city: string;
  lat: number;
  lng: number;
  description: string;
  image_url: string | null;
  photos: string[];
  budget: 1 | 2 | 3 | 4 | null;
  rating: number;
  reviews_count: number;
  hours: string;
  comments: Array<{ author: string; text: string; avatar?: string | null }>;
  isCommunity?: boolean;
  provider?: string;
  source_url?: string | null;
  booking_url?: string | null;
  price_text?: string | null;
  created_at?: string;
  isSearched?: boolean;
  filter_categories?: string[];
  marker_category?: string;
  isOffer?: boolean;
  catalog_kind?: LiveCatalogItem["kind"];
  catalog_tags?: Record<string, unknown> | null;
};

export type SortKey = "popular" | "recent";
export type MapViewport = { south: number; west: number; north: number; east: number; zoom: number };

export const BUDGET_LABELS = ["€", "€€", "€€€", "€€€€"];
export const MAP_PLACE_CATEGORIES = [
  { value: "deal", label: "Offres", emoji: "🔥" },
  ...PLACE_CATEGORIES,
] as const;
export const MAP_BASE_KINDS: LiveCatalogKind[] = ["activity", "restaurant", "hotel"];
export const ALL_PLACE_CATEGORIES = MAP_PLACE_CATEGORIES.map((category) => category.value);
export const PRIMARY_PLACE_CATEGORIES = new Set(["deal", "restaurant", "hotel", "activite"]);
export const SECONDARY_PLACE_CATEGORIES = MAP_PLACE_CATEGORIES.filter(
  (category) => !PRIMARY_PLACE_CATEGORIES.has(category.value),
);

export function categoriesFromSettings(settings: AccountSettings) {
  const categories = new Set<string>(ALL_PLACE_CATEGORIES);
  if (!settings.map_offers) categories.delete("deal");
  if (!settings.map_hotels) categories.delete("hotel");
  if (!settings.map_restaurants) categories.delete("restaurant");
  if (!settings.map_activities) {
    for (const category of ALL_PLACE_CATEGORIES) {
      if (!["deal", "hotel", "restaurant"].includes(category)) categories.delete(category);
    }
  }
  return categories;
}

export async function fetchMapCatalog(options: { limit: number; city?: string; country?: string }) {
  const [baseItems, dealItems] = await Promise.all([
    fetchLiveCatalog({
      kinds: MAP_BASE_KINDS,
      limit: options.limit,
      city: options.city,
      country: options.country,
    }),
    fetchLiveCatalog({
      kinds: ["deal"],
      limit: Math.min(200, options.limit),
      city: options.city,
      country: options.country,
    }),
  ]);

  const locatedDeals = dealItems.filter((item) => item.latitude != null && item.longitude != null);
  const fallbackOfferKeys = selectFallbackOfferKeys(baseItems, locatedDeals.length > 0 ? 50 : 80);
  const visibleBaseItems = baseItems.map((item) =>
    fallbackOfferKeys.has(catalogKey(item))
      ? {
          ...item,
          tags: {
            ...(item.tags ?? {}),
            map_offer_fallback: true,
            original_kind: item.kind,
          },
        }
      : item,
  );

  const seen = new Set<string>();
  return [...locatedDeals, ...visibleBaseItems]
    .filter((item) => item.latitude != null && item.longitude != null)
    .filter((item) => {
      const key = catalogKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, options.limit);
}

export function catalogKey(item: Pick<LiveCatalogItem, "provider" | "external_id">) {
  return `${item.provider}:${item.external_id}`;
}

export function selectFallbackOfferKeys(items: LiveCatalogItem[], limit = 30) {
  return new Set(
    [...items]
      .filter((item) => item.latitude != null && item.longitude != null)
      .filter((item) => item.booking_url || item.source_url)
      .sort((a, b) => catalogOfferScore(b) - catalogOfferScore(a))
      .slice(0, limit)
      .map(catalogKey),
  );
}

export function catalogOfferScore(item: LiveCatalogItem) {
  return (
    (item.booking_url ? 5 : 0) +
    (item.source_url ? 2 : 0) +
    (item.image_url ? 2 : 0) +
    (item.rating != null ? 1 : 0) +
    (item.reviews_count > 0 ? 1 : 0)
  );
}

export function catalogBaseCategory(item: LiveCatalogItem) {
  if (item.kind === "restaurant") return "restaurant";
  if (item.kind === "hotel") return "hotel";
  return item.category || "activite";
}

export function catalogMarkerCategory(item: LiveCatalogItem) {
  const originalKind =
    typeof item.tags?.original_kind === "string" ? item.tags.original_kind : item.kind;
  if (originalKind === "restaurant") return "restaurant";
  if (originalKind === "hotel") return "hotel";
  return item.category || "activite";
}

export function isMapOfferFallback(item: LiveCatalogItem) {
  return item.tags?.map_offer_fallback === true;
}

export function mapCategoryMeta(value?: string | null) {
  return MAP_PLACE_CATEGORIES.find((category) => category.value === value);
}

export function isOfferPlace(place: Pick<AnyPlace, "category" | "filter_categories" | "isOffer">) {
  return (
    place.isOffer === true ||
    place.category === "deal" ||
    (place.filter_categories ?? []).includes("deal")
  );
}

export function distanceBetweenKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radius = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
