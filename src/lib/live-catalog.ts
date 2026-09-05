import { supabase } from "@/integrations/supabase/client";
import { fetchBrowserViewportCatalog } from "./browser-viewport-catalog";
import {
  catalogIdentityKey,
  getCachedViewportCatalog,
  saveCachedViewportCatalog,
  type CatalogViewportBounds,
} from "./viewport-catalog-cache";
import {
  getHomepageInternetCatalog,
  getMapInternetCatalog,
  getViewportInternetCatalog,
  searchInternetCatalog,
} from "./public-travel-catalog.functions";
import { fetchOfficialProviderCatalog } from "./official-catalog-apis.functions";
import {
  enrichSpecializedCatalogSource,
  filterTrustedVisibleCatalogItems,
  specializedReservationLabel,
  specializedSourceLabel,
} from "./catalog-source-routing";
import { filterReliableCatalogItems, filterReliableMapCatalogItems } from "./catalog-reliability";
import { dedupeVerifiedCatalogItems } from "./catalog-quality";
import { curatedActivitiesForCountry, dailyWorldActivitySelection } from "./world-activities";

export type LiveCatalogKind = "activity" | "restaurant" | "hotel" | "deal";

export type LiveCatalogItem = {
  id: string;
  provider: string;
  external_id: string;
  kind: LiveCatalogKind;
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
  tags: Record<string, unknown> | null;
  fetched_at: string;
  valid_until: string | null;
};

const db = supabase as any;

function viewportCoverageTarget(bounds: CatalogViewportBounds) {
  if (bounds.zoom >= 13) return 24;
  if (bounds.zoom >= 10) return 16;
  return 8;
}

function hasUsefulViewportCoverage(rows: LiveCatalogItem[], bounds: CatalogViewportBounds) {
  if (rows.length < viewportCoverageTarget(bounds)) return false;
  const kinds = new Set(rows.map((row) => row.kind).filter((kind) => kind !== "deal"));
  return kinds.size >= 2;
}

export async function fetchLiveCatalog(
  options: {
    kinds?: LiveCatalogKind[];
    limit?: number;
    city?: string;
    country?: string;
  } = {},
): Promise<LiveCatalogItem[]> {
  const limit = Math.min(600, Math.max(1, Math.trunc(options.limit ?? 100)));
  const wantsDealsOnly = !!options.kinds?.length && options.kinds.every((kind) => kind === "deal");
  const wantsActivities = !options.kinds?.length || options.kinds.includes("activity");
  const curatedRows: LiveCatalogItem[] = wantsActivities
    ? options.country
      ? curatedActivitiesForCountry(options.country)
      : !options.city && limit <= 260
        ? dailyWorldActivitySelection(Math.min(48, limit))
        : []
    : [];
  let databaseRows: LiveCatalogItem[] = [];

  try {
    let query = db
      .from("external_catalog_items")
      .select(
        "id,provider,external_id,kind,slug,title,description,category,city,country,country_code,latitude,longitude,image_url,source_url,booking_url,price_amount,currency,price_text,rating,reviews_count,opening_hours,tags,fetched_at,valid_until",
      )
      .eq("published", true)
      .eq("admin_hidden", false)
      .order("fetched_at", { ascending: false })
      .limit(limit);

    if (options.kinds?.length) query = query.in("kind", options.kinds);
    if (options.city) query = query.ilike("city", `%${options.city.slice(0, 80)}%`);
    if (options.country) query = query.ilike("country", `%${options.country.slice(0, 80)}%`);

    const { data, error } = await query;
    if (!error) databaseRows = ((data ?? []) as LiveCatalogItem[]).map(enrichCatalogRow);
    else if (!/external_catalog_items|relation .* does not exist/i.test(error.message ?? ""))
      console.warn("[GlobeLink catalog] Database catalog unavailable", error.message);
  } catch (error) {
    console.warn("[GlobeLink catalog] Database catalog request failed", error);
  }

  const visibleDatabaseRows = visibleCatalogRows(databaseRows);
  if (wantsDealsOnly) return visibleDatabaseRows;

  // Local-first: a sufficiently populated Supabase result is returned without
  // touching paid providers. Open/public sources are tried next; Google is only
  // a final fallback when the local/public catalogue is still too sparse.
  const localRows = uniqueCatalogRows(visibleCatalogRows([...curatedRows, ...visibleDatabaseRows]));
  const enoughLocalRows = visibleDatabaseRows.length >= Math.min(limit, 24);
  if (enoughLocalRows) return localRows.slice(0, limit);

  const isMapRequest = limit > 200 && !options.city && !options.country;
  let publicRows: LiveCatalogItem[] = [];
  try {
    const kinds = options.kinds?.filter(
      (kind): kind is Exclude<LiveCatalogKind, "deal"> => kind !== "deal",
    );
    const locationQuery = [options.city, options.country].filter(Boolean).join(", ");
    const directRows: LiveCatalogItem[] = (
      locationQuery
        ? await searchInternetCatalog({ data: { query: locationQuery } })
        : isMapRequest
          ? await getMapInternetCatalog()
          : await getHomepageInternetCatalog()
    ) as LiveCatalogItem[];
    publicRows = visibleCatalogRows(
      directRows.filter(
        (item) => item.kind !== "deal" && (!kinds?.length || kinds.includes(item.kind)),
      ),
    );
  } catch (error) {
    console.warn("[GlobeLink catalog] Public catalog fallback unavailable", error);
  }

  const localAndPublic = uniqueCatalogRows(
    visibleCatalogRows([...curatedRows, ...visibleDatabaseRows, ...publicRows]),
  );
  if (localAndPublic.length >= Math.min(limit, 24)) return localAndPublic.slice(0, limit);

  const officialRows = await fetchOfficialRows({
    kinds: options.kinds,
    limit,
    city: options.city,
    country: options.country,
  });
  return uniqueCatalogRows(
    visibleCatalogRows([...officialRows, ...localAndPublic]),
  ).slice(0, limit);
}

const VIEWPORT_SELECT =
  "id,provider,external_id,kind,slug,title,description,category,city,country,country_code,latitude,longitude,image_url,source_url,booking_url,price_amount,currency,price_text,rating,reviews_count,opening_hours,tags,fetched_at,valid_until";

function uniqueCatalogRows(rows: LiveCatalogItem[]) {
  const byProviderIdentity = rows.filter((item, index, all) => {
    const key = catalogIdentityKey(item);
    return all.findIndex((candidate) => catalogIdentityKey(candidate) === key) === index;
  });
  return dedupeVerifiedCatalogItems(byProviderIdentity);
}

function visibleCatalogRows(rows: LiveCatalogItem[]) {
  return filterReliableCatalogItems(filterTrustedVisibleCatalogItems(rows));
}

async function requireRows(promise: Promise<unknown>, source: string) {
  const rows = visibleCatalogRows(((await promise) as LiveCatalogItem[]).map(enrichCatalogRow));
  if (!rows.length) throw new Error(`${source}: aucun lieu retourné`);
  return rows;
}

async function fetchOfficialRows(options: {
  kinds?: LiveCatalogKind[];
  limit: number;
  city?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
}) {
  const kinds = options.kinds?.filter(
    (kind): kind is Exclude<LiveCatalogKind, "deal"> => kind !== "deal",
  );
  if (!options.city && !options.country && options.latitude == null) return [] as LiveCatalogItem[];
  try {
    const rows = (await fetchOfficialProviderCatalog({
      data: {
        kinds,
        limit: Math.min(options.limit, 120),
        city: options.city ?? null,
        country: options.country ?? null,
        latitude: options.latitude ?? null,
        longitude: options.longitude ?? null,
        radiusMeters: options.radiusMeters ?? null,
      },
    })) as LiveCatalogItem[];
    return uniqueCatalogRows(visibleCatalogRows(rows.map(enrichCatalogRow)));
  } catch (error) {
    console.warn("[GlobeLink catalog] Official provider APIs unavailable", error);
    return [] as LiveCatalogItem[];
  }
}

export async function fetchPersistedViewportCatalog(
  bounds: CatalogViewportBounds,
): Promise<LiveCatalogItem[]> {
  try {
    const { data, error } = await db
      .from("external_catalog_items")
      .select(VIEWPORT_SELECT)
      .eq("published", true)
      .eq("admin_hidden", false)
      .gte("latitude", bounds.south)
      .lte("latitude", bounds.north)
      .gte("longitude", bounds.west)
      .lte("longitude", bounds.east)
      .limit(bounds.zoom >= 11 ? 500 : 280);
    if (error) throw error;
    const rows = uniqueCatalogRows(
      filterReliableMapCatalogItems(
        visibleCatalogRows(((data ?? []) as LiveCatalogItem[]).map(enrichCatalogRow)),
      ),
    );
    if (rows.length) saveCachedViewportCatalog(bounds, rows);
    return rows;
  } catch (error) {
    console.warn("[GlobeLink catalog] Viewport database cache unavailable", error);
    return [];
  }
}

export async function fetchFastViewportCatalog(
  bounds: CatalogViewportBounds,
): Promise<LiveCatalogItem[]> {
  if (typeof window === "undefined" || bounds.zoom < 7) return [];

  const localRows = getCachedViewportCatalog(bounds);
  const databaseRows = await fetchPersistedViewportCatalog(bounds);
  let zeroCostRows = uniqueCatalogRows(
    filterReliableMapCatalogItems(
      visibleCatalogRows([...localRows, ...databaseRows].map(enrichCatalogRow)),
    ),
  );
  if (hasUsefulViewportCoverage(zeroCostRows, bounds)) return zeroCostRows;

  // Fill gaps from the public OSM/browser layer before considering Google.
  try {
    const publicRows = (await fetchBrowserViewportCatalog(bounds, { mode: "fast" })) as LiveCatalogItem[];
    zeroCostRows = uniqueCatalogRows(
      filterReliableMapCatalogItems(
        visibleCatalogRows([...zeroCostRows, ...publicRows].map(enrichCatalogRow)),
      ),
    );
    if (hasUsefulViewportCoverage(zeroCostRows, bounds)) {
      saveCachedViewportCatalog(bounds, zeroCostRows);
      return zeroCostRows;
    }
  } catch (error) {
    console.warn("[GlobeLink catalog] Fast public viewport pass unavailable", error);
  }

  const centerLatitude = (bounds.north + bounds.south) / 2;
  const centerLongitude = (bounds.east + bounds.west) / 2;
  const radiusMeters = Math.max(
    1_000,
    Math.min(
      40_000,
      Math.round(Math.max(bounds.north - bounds.south, bounds.east - bounds.west) * 60_000),
    ),
  );

  try {
    // Paid/official providers are now a true fallback: they are queried only
    // when Supabase + cached + public OSM data cannot populate the viewport.
    const officialRows = (await fetchOfficialProviderCatalog({
      data: {
        kinds: ["activity", "hotel", "restaurant"],
        limit: bounds.zoom >= 13 ? 120 : 80,
        latitude: centerLatitude,
        longitude: centerLongitude,
        radiusMeters,
      },
    })) as LiveCatalogItem[];
    const merged = uniqueCatalogRows(
      filterReliableMapCatalogItems(
        visibleCatalogRows([...zeroCostRows, ...officialRows].map(enrichCatalogRow)),
      ),
    );
    if (merged.length) saveCachedViewportCatalog(bounds, merged);
    return merged;
  } catch (error) {
    console.warn("[GlobeLink catalog] Official viewport fallback unavailable", error);
    return zeroCostRows;
  }
}

export async function fetchLiveViewportCatalog(
  bounds: CatalogViewportBounds,
): Promise<LiveCatalogItem[]> {
  let rows: LiveCatalogItem[] = [];
  const persistedRows = await fetchPersistedViewportCatalog(bounds);
  if (hasUsefulViewportCoverage(persistedRows, bounds)) return persistedRows;

  try {
    if (typeof window !== "undefined" && bounds.zoom >= 7) {
      rows = (await getViewportInternetCatalog({ data: bounds })) as LiveCatalogItem[];
      if (!rows.length) {
        rows = (await fetchBrowserViewportCatalog(bounds, { mode: "full" })) as LiveCatalogItem[];
      }
    } else {
      rows = (await getViewportInternetCatalog({ data: bounds })) as LiveCatalogItem[];
    }
  } catch (error) {
    console.warn("[GlobeLink catalog] Public viewport source unavailable", error);
  }

  let unique = uniqueCatalogRows(
    filterReliableMapCatalogItems(
      visibleCatalogRows([...persistedRows, ...rows].map(enrichCatalogRow)),
    ),
  );
  if (hasUsefulViewportCoverage(unique, bounds)) {
    saveCachedViewportCatalog(bounds, unique);
    return unique;
  }

  // Only enrich a genuinely sparse viewport through official providers.
  if (typeof window !== "undefined" && bounds.zoom >= 7) {
    const centerLatitude = (bounds.north + bounds.south) / 2;
    const centerLongitude = (bounds.east + bounds.west) / 2;
    const radiusMeters = Math.max(
      1_000,
      Math.min(
        40_000,
        Math.round(Math.max(bounds.north - bounds.south, bounds.east - bounds.west) * 60_000),
      ),
    );
    try {
      const officialRows = (await fetchOfficialProviderCatalog({
        data: {
          kinds: ["activity", "hotel", "restaurant"],
          limit: bounds.zoom >= 13 ? 120 : 80,
          latitude: centerLatitude,
          longitude: centerLongitude,
          radiusMeters,
        },
      })) as LiveCatalogItem[];
      unique = uniqueCatalogRows(
        filterReliableMapCatalogItems(
          visibleCatalogRows([...unique, ...officialRows].map(enrichCatalogRow)),
        ),
      );
    } catch (error) {
      console.warn("[GlobeLink catalog] Official sparse-viewport fallback unavailable", error);
    }
  }

  if (unique.length) saveCachedViewportCatalog(bounds, unique);
  return unique;
}

export async function fetchViewportCatalog(
  bounds: CatalogViewportBounds,
): Promise<LiveCatalogItem[]> {
  // Resolve local cache and persisted Supabase rows first. Only if coverage is
  // still insufficient do we launch the live/public/official fallback chain.
  const localRows = getCachedViewportCatalog(bounds);
  const databaseRows = await fetchPersistedViewportCatalog(bounds);
  const localAndDatabase = uniqueCatalogRows(
    visibleCatalogRows([...localRows, ...databaseRows].map(enrichCatalogRow)),
  );
  if (hasUsefulViewportCoverage(localAndDatabase, bounds)) return localAndDatabase;

  const internetRows = await fetchLiveViewportCatalog(bounds);
  return uniqueCatalogRows(
    visibleCatalogRows([...localAndDatabase, ...internetRows].map(enrichCatalogRow)),
  );
}

export async function fetchLiveDeal(slug: string): Promise<LiveCatalogItem | null> {
  const { data, error } = await db
    .from("external_catalog_items")
    .select(
      "id,provider,external_id,kind,slug,title,description,category,city,country,country_code,latitude,longitude,image_url,source_url,booking_url,price_amount,currency,price_text,rating,reviews_count,opening_hours,tags,fetched_at,valid_until",
    )
    .eq("kind", "deal")
    .eq("slug", slug)
    .eq("published", true)
    .eq("admin_hidden", false)
    .maybeSingle();
  if (error) {
    if (/external_catalog_items|relation .* does not exist/i.test(error.message ?? "")) return null;
    throw error;
  }
  return data ? enrichCatalogRow(data as LiveCatalogItem) : null;
}

export function reservationUrl(
  item: Pick<
    LiveCatalogItem,
    "booking_url" | "source_url" | "kind" | "title" | "city" | "country" | "tags"
  >,
) {
  const direct = item.booking_url?.trim();
  if (direct && /^https?:\/\//i.test(direct) && !/openstreetmap\.org/i.test(direct)) return direct;
  const source = item.source_url?.trim();
  if (source && /^https?:\/\//i.test(source) && !/openstreetmap\.org/i.test(source)) return source;
  return "#";
}

export function reservationLabel(
  item: Pick<LiveCatalogItem, "booking_url"> &
    Partial<Pick<LiveCatalogItem, "source_url" | "kind" | "title" | "city" | "country" | "tags">>,
) {
  if (item.kind && item.title) {
    const label = specializedReservationLabel({
      kind: item.kind,
      title: item.title,
      city: item.city,
      country: item.country,
      tags: item.tags,
    });
    if (label) return label;
  }
  return item.booking_url || item.source_url ? "Voir la source officielle" : "Source indisponible";
}

export function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    openstreetmap: "OpenStreetMap",
    "openstreetmap-live": "OpenStreetMap (direct)",
    "openstreetmap-browser": "OpenStreetMap (direct navigateur)",
    "wikidata-public": "Wikidata (API publique)",
    "google-places": "Google Places",
    ticketmaster: "Ticketmaster",
    "booking-com": "Booking.com",
    booking: "Booking.com",
    getyourguide: "GetYourGuide",
    tripadvisor: "Tripadvisor",
    "tripadvisor-attractions": "Tripadvisor",
    "tripadvisor-activities": "Tripadvisor",
    "tripadvisor-restaurants": "Tripadvisor",
    "uber-eats": "Uber Eats",
    ubereats: "Uber Eats",
    "yelp-restaurants": "Yelp",
    yelp: "Yelp",
    thefork: "TheFork",
    opentable: "OpenTable",
    "globelink-curated": "Sélection GlobeLink vérifiée",
    amadeus: "Amadeus",
    tavily: "Source web",
  };
  return labels[provider] ?? provider;
}

function enrichCatalogRow(item: LiveCatalogItem): LiveCatalogItem {
  if (item.kind === "deal") return item;
  return enrichSpecializedCatalogSource(item);
}

export function catalogSourceLabel(
  item: Pick<LiveCatalogItem, "kind" | "title" | "city" | "country" | "provider" | "tags">,
) {
  return (
    specializedSourceLabel({
      kind: item.kind,
      title: item.title,
      city: item.city,
      country: item.country,
      tags: item.tags,
    }) ?? providerLabel(item.provider)
  );
}

function tagText(tags: Record<string, unknown> | null, key: string) {
  const value = tags?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function catalogOfficialWebsite(item: Pick<LiveCatalogItem, "booking_url" | "tags">) {
  return (
    tagText(item.tags, "official_website") ??
    tagText(item.tags, "website") ??
    (tagText(item.tags, "source_strategy") ? null : item.booking_url)
  );
}

export function itemLocation(item: Pick<LiveCatalogItem, "city" | "country">) {
  return [item.city, item.country].filter(Boolean).join(", ");
}

export function itemPrice(item: Pick<LiveCatalogItem, "price_text" | "price_amount" | "currency">) {
  if (item.price_text) return item.price_text;
  if (item.price_amount != null && item.currency) {
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: item.currency }).format(
        item.price_amount,
      );
    } catch {
      return `${item.price_amount} ${item.currency}`;
    }
  }
  return "Voir le prix";
}

export function dailyRefreshLabel(date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
