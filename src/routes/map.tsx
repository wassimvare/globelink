import { createFileRoute, ClientOnly, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { PLACE_CATEGORIES } from "@/lib/countries";
import { fetchLocatedTravelers, type LocatedTraveler } from "@/lib/real-travelers";
import { COUNTRY_INFO } from "@/lib/country-info";
import { CountrySheet } from "@/components/CountrySheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bookmark,
  Share2,
  Star,
  Clock,
  MapPin,
  Users,
  Sparkles,
  Crown,
  X,
  LocateFixed,
  Loader2,
  Search,
  Navigation,
  Phone,
  ExternalLink,
  SlidersHorizontal,
  Plus,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchLiveCatalog,
  fetchFastViewportCatalog,
  fetchLiveViewportCatalog,
  fetchPersistedViewportCatalog,
  catalogSourceLabel,
  type LiveCatalogItem,
  type LiveCatalogKind,
} from "@/lib/live-catalog";
import { isTrustedVisibleCatalogItem } from "@/lib/catalog-source-routing";
import { CatalogImage, catalogPlaceMediaInput } from "@/components/CatalogImage";
import {
  resolveVerifiedPlaceMedia,
  verifiedPlaceMediaQueryKey,
  type ResolvedPlaceMedia,
} from "@/lib/place-media.functions";
import { getSignedMediaUrl } from "@/lib/storage";
import { catalogIdentityKey, getCachedViewportCatalog } from "@/lib/viewport-catalog-cache";
import { WORLD_MAP_HUBS } from "@/lib/world-map-hubs";
import { useAuth } from "@/lib/auth-context";
import {
  DEFAULT_ACCOUNT_SETTINGS,
  getAccountSettings,
  type AccountSettings,
} from "@/lib/account-settings";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Carte du monde — GlobeLink" },
      {
        name: "description",
        content:
          "Voyageurs, offres du moment, restaurants, hôtels, activités et lieux utiles sur une carte mondiale filtrée par budget, pays et popularité.",
      },
    ],
  }),
  component: MapPage,
});

// EXPLORER_TRAVEL_MAP_V1
// JOURNEY_CONTINUITY_V1_MAP
// EXPLORER_ADD_TO_TRIP_MOBILE_FIX_V1

type AnyPlace = {
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
type SortKey = "popular" | "recent";
type MapViewport = { south: number; west: number; north: number; east: number; zoom: number };

const BUDGET_LABELS = ["€", "€€", "€€€", "€€€€"];
const MAP_PLACE_CATEGORIES = [
  { value: "deal", label: "Offres", emoji: "🔥" },
  ...PLACE_CATEGORIES,
] as const;
const MAP_BASE_KINDS: LiveCatalogKind[] = ["activity", "restaurant", "hotel"];
const ALL_PLACE_CATEGORIES = MAP_PLACE_CATEGORIES.map((category) => category.value);
const PRIMARY_PLACE_CATEGORIES = new Set(["deal", "restaurant", "hotel", "activite"]);
const SECONDARY_PLACE_CATEGORIES = MAP_PLACE_CATEGORIES.filter(
  (category) => !PRIMARY_PLACE_CATEGORIES.has(category.value),
);

function categoriesFromSettings(settings: AccountSettings) {
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

async function fetchMapCatalog(options: { limit: number; city?: string; country?: string }) {
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

function catalogKey(item: Pick<LiveCatalogItem, "provider" | "external_id">) {
  return `${item.provider}:${item.external_id}`;
}

function selectFallbackOfferKeys(items: LiveCatalogItem[], limit = 30) {
  return new Set(
    [...items]
      .filter((item) => item.latitude != null && item.longitude != null)
      .filter((item) => item.booking_url || item.source_url)
      .sort((a, b) => catalogOfferScore(b) - catalogOfferScore(a))
      .slice(0, limit)
      .map(catalogKey),
  );
}

function catalogOfferScore(item: LiveCatalogItem) {
  return (
    (item.booking_url ? 5 : 0) +
    (item.source_url ? 2 : 0) +
    (item.image_url ? 2 : 0) +
    (item.rating != null ? 1 : 0) +
    (item.reviews_count > 0 ? 1 : 0)
  );
}

function catalogBaseCategory(item: LiveCatalogItem) {
  if (item.kind === "restaurant") return "restaurant";
  if (item.kind === "hotel") return "hotel";
  return item.category || "activite";
}

function catalogMarkerCategory(item: LiveCatalogItem) {
  const originalKind =
    typeof item.tags?.original_kind === "string" ? item.tags.original_kind : item.kind;
  if (originalKind === "restaurant") return "restaurant";
  if (originalKind === "hotel") return "hotel";
  return item.category || "activite";
}

function isMapOfferFallback(item: LiveCatalogItem) {
  return item.tags?.map_offer_fallback === true;
}

function mapCategoryMeta(value?: string | null) {
  return MAP_PLACE_CATEGORIES.find((category) => category.value === value);
}

function isOfferPlace(place: Pick<AnyPlace, "category" | "filter_categories" | "isOffer">) {
  return (
    place.isOffer === true ||
    place.category === "deal" ||
    (place.filter_categories ?? []).includes("deal")
  );
}

function distanceBetweenKm(aLat: number, aLng: number, bLat: number, bLng: number) {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function verifiedExternalImageUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (/^(images\.)?unsplash\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const PRELOADED_PLACE_MEDIA = new Set<string>();
const PREFETCHING_PLACE_MEDIA = new Set<string>();
const ATTEMPTED_PLACE_MEDIA = new Map<string, number>();
const PLACE_MEDIA_ATTEMPT_TTL_MS = 10 * 60_000;

function placeMediaKind(place: AnyPlace): LiveCatalogItem["kind"] {
  return (
    place.catalog_kind ??
    (isOfferPlace(place)
      ? "deal"
      : place.category === "hotel"
        ? "hotel"
        : place.category === "restaurant"
          ? "restaurant"
          : "activity")
  );
}

function placeMediaItem(place: AnyPlace) {
  return {
    id: place.id,
    kind: placeMediaKind(place),
    title: place.name,
    image_url: place.image_url,
    tags: place.catalog_tags ?? null,
  } satisfies Pick<LiveCatalogItem, "id" | "kind" | "title" | "image_url" | "tags">;
}

function placeMediaLookup(place: AnyPlace) {
  if (place.isCommunity) return null;
  return {
    latitude: place.lat,
    longitude: place.lng,
    city: place.city || null,
    country: place.country || null,
    address: placeAddress(place) || null,
    website: placeWebsite(place) || null,
  };
}

function preloadPlaceMediaUrl(value: string | null | undefined, highPriority = false) {
  const url = verifiedExternalImageUrl(value);
  if (!url || typeof window === "undefined" || PRELOADED_PLACE_MEDIA.has(url)) return;
  PRELOADED_PLACE_MEDIA.add(url);
  const image = new Image();
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  try {
    image.fetchPriority = highPriority ? "high" : "low";
  } catch {
    // Older browsers simply ignore fetchPriority.
  }
  image.src = url;
}

function MapPage() {
  const { user } = useAuth();
  const mediaQueryClient = useQueryClient();
  const resolvePlaceMedia = useServerFn(resolveVerifiedPlaceMedia);
  const appliedMapPreferencesForUser = useRef<string | null>(null);
  const autoLocatedForUser = useRef<string | null>(null);

  const { data: accountSettings } = useQuery({
    queryKey: ["account-settings", user?.id],
    enabled: !!user,
    queryFn: () => getAccountSettings(user!.id),
    staleTime: 60_000,
  });
  const effectiveAccountSettings = accountSettings ?? DEFAULT_ACCOUNT_SETTINGS;

  const { data: dbPlaces } = useQuery({
    queryKey: ["places"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("places")
        .select(
          "id,name,category,country,city,lat,lng,description,image_url,created_at,moderation_status",
        )
        .eq("moderation_status", "approved")
        .limit(500);
      if (error) throw error;
      return Promise.all(
        (data ?? []).map(async (place) => ({
          ...place,
          image_url: place.image_url ? await getSignedMediaUrl(place.image_url) : null,
        })),
      );
    },
  });

  const {
    data: internetPlaces = [],
    isLoading: internetLoading,
    isError: internetError,
  } = useQuery({
    queryKey: ["live-catalog", "map-places-with-deals"],
    queryFn: () => fetchMapCatalog({ limit: 700 }),
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set(ALL_PLACE_CATEGORIES));
  const [budgets, setBudgets] = useState<Set<1 | 2 | 3 | 4>>(new Set([1, 2, 3, 4]));
  const [countryQuery, setCountryQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const deferredCountryQuery = useDeferredValue(countryQuery.trim());
  const [sort, setSort] = useState<SortKey>("popular");
  const [showTravelers, setShowTravelers] = useState(true);
  const [selected, setSelected] = useState<AnyPlace | null>(null);
  const [selectedTraveler, setSelectedTraveler] = useState<LocatedTraveler | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState<MapViewport | null>(null);

  useEffect(() => {
    if (!user) {
      appliedMapPreferencesForUser.current = null;
      autoLocatedForUser.current = null;
      setActiveCats(new Set(ALL_PLACE_CATEGORIES));
      return;
    }
    if (!accountSettings || appliedMapPreferencesForUser.current === user.id) return;
    setActiveCats(categoriesFromSettings(accountSettings));
    appliedMapPreferencesForUser.current = user.id;
  }, [user?.id, accountSettings]);

  const locateMe = useCallback(
    (silent = false) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        if (!silent) toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
        return;
      }
      const precise = effectiveAccountSettings.use_location && effectiveAccountSettings.precise_location;
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const latitude = precise ? coords.latitude : Math.round(coords.latitude * 100) / 100;
          const longitude = precise ? coords.longitude : Math.round(coords.longitude * 100) / 100;
          const rawAccuracy = Number.isFinite(coords.accuracy) ? Math.min(coords.accuracy, 5000) : null;
          const accuracy = precise ? rawAccuracy : Math.max(rawAccuracy ?? 0, 1500);
          setUserPosition([latitude, longitude]);
          setUserAccuracy(accuracy || null);
          setLocating(false);
          if (!silent)
            toast.success(precise ? "Ta position précise est affichée" : "Ta position approximative est affichée");
        },
        (error) => {
          setLocating(false);
          if (silent) return;
          const message =
            error.code === error.PERMISSION_DENIED
              ? "Autorise la localisation dans ton navigateur pour te voir sur la carte."
              : "Impossible de récupérer ta position pour le moment.";
          toast.error(message);
        },
        {
          enableHighAccuracy: precise,
          timeout: 10000,
          maximumAge: precise ? 120000 : 600000,
        },
      );
    },
    [effectiveAccountSettings.precise_location, effectiveAccountSettings.use_location],
  );

  useEffect(() => {
    if (!user || !accountSettings?.use_location || autoLocatedForUser.current === user.id) return;
    autoLocatedForUser.current = user.id;
    locateMe(true);
  }, [user?.id, accountSettings?.use_location, locateMe]);

  const viewportKey = viewport
    ? [
        Number(viewport.south.toFixed(2)),
        Number(viewport.west.toFixed(2)),
        Number(viewport.north.toFixed(2)),
        Number(viewport.east.toFixed(2)),
        Math.round(viewport.zoom),
      ]
    : null;

  const {
    data: persistedViewportPlaces = [],
    isFetching: persistedViewportLoading,
    refetch: refetchPersistedViewport,
  } = useQuery({
    queryKey: ["live-catalog", "viewport", "persisted", viewportKey],
    queryFn: () => fetchPersistedViewportCatalog(viewport!),
    enabled: !!viewport && viewport.zoom >= 5,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const {
    data: fastViewportPlaces = [],
    isFetching: fastViewportLoading,
    refetch: refetchFastViewport,
  } = useQuery({
    queryKey: ["live-catalog", "viewport", "fast", viewportKey],
    queryFn: () => fetchFastViewportCatalog(viewport!),
    enabled: !!viewport && viewport.zoom >= 7,
    initialData: () => (viewport ? getCachedViewportCatalog(viewport) : []),
    initialDataUpdatedAt: 0,
    staleTime: 2 * 60_000,
    retry: 0,
  });

  const {
    data: viewportInternetPlaces = [],
    isFetching: viewportLoading,
    isError: viewportError,
    refetch: refetchLiveViewport,
  } = useQuery({
    queryKey: ["live-catalog", "viewport", "full", viewportKey],
    queryFn: () => fetchLiveViewportCatalog(viewport!),
    enabled: !!viewport && viewport.zoom >= 5 && (viewport.zoom < 7 || !fastViewportLoading),
    initialData: () => (viewport ? getCachedViewportCatalog(viewport) : []),
    initialDataUpdatedAt: 0,
    staleTime: 15 * 60_000,
    retry: 0,
  });

  const viewportRefreshing = persistedViewportLoading || fastViewportLoading || viewportLoading;

  const { data: searchedInternetPlaces = [], isFetching: searchingInternet } = useQuery({
    queryKey: ["live-catalog", "map-location", deferredCountryQuery],
    queryFn: () => fetchMapCatalog({ limit: 240, city: deferredCountryQuery }),
    enabled: deferredCountryQuery.length >= 2,
    staleTime: 30 * 60_000,
    retry: 1,
  });

  const mergedInternetPlaces = useMemo(() => {
    const rows = [
      ...searchedInternetPlaces,
      ...fastViewportPlaces,
      ...viewportInternetPlaces,
      ...persistedViewportPlaces,
      ...internetPlaces,
    ];
    const seen = new Set<string>();
    return rows.filter((item) => {
      const key = catalogIdentityKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    fastViewportPlaces,
    internetPlaces,
    persistedViewportPlaces,
    searchedInternetPlaces,
    viewportInternetPlaces,
  ]);
  const searchedExternalIds = useMemo(
    () => new Set(searchedInternetPlaces.map((item) => catalogIdentityKey(item))),
    [searchedInternetPlaces],
  );

  const allPlaces: AnyPlace[] = useMemo(() => {
    const community: AnyPlace[] = (dbPlaces ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      country: p.country,
      city: p.city ?? "",
      lat: p.lat,
      lng: p.lng,
      description: p.description ?? "",
      image_url: p.image_url,
      photos: p.image_url ? [p.image_url] : [],
      budget: null,
      rating: 0,
      reviews_count: 0,
      hours: "Horaires non renseignés",
      comments: [],
      isCommunity: true,
      provider: "GlobeLink",
      source_url: null,
      booking_url: null,
      price_text: null,
      created_at: p.created_at,
      filter_categories: [p.category],
      marker_category: p.category,
      isOffer: false,
    }));
    const external: AnyPlace[] = mergedInternetPlaces.flatMap((item) => {
      if (item.latitude == null || item.longitude == null) return [];
      if (item.kind !== "deal" && !isTrustedVisibleCatalogItem(item)) return [];
      const baseCategory = catalogBaseCategory(item);
      const markerCategory = catalogMarkerCategory(item);
      const offerFallback = isMapOfferFallback(item);
      const isOffer = item.kind === "deal" || offerFallback;
      const category = isOffer ? "deal" : baseCategory;
      const filterCategories = Array.from(new Set([category, baseCategory, markerCategory]));
      const verifiedImage = verifiedExternalImageUrl(item.image_url);
      return [
        {
          id: `external-${item.id}`,
          name: item.title,
          category,
          country: item.country ?? "",
          city: item.city ?? "",
          lat: Number(item.latitude),
          lng: Number(item.longitude),
          description: item.description ?? "Informations issues de la source externe.",
          image_url: verifiedImage,
          photos: verifiedImage ? [verifiedImage] : [],
          budget: null,
          rating: item.rating ?? 0,
          reviews_count: item.reviews_count ?? 0,
          hours: item.opening_hours || "Horaires à vérifier sur la source",
          comments: [],
          isCommunity: false,
          provider: catalogSourceLabel(item),
          source_url: item.source_url,
          booking_url: item.booking_url,
          price_text: item.price_text,
          created_at: item.fetched_at,
          isSearched: searchedExternalIds.has(catalogIdentityKey(item)),
          filter_categories: filterCategories,
          marker_category: markerCategory,
          isOffer,
          catalog_kind: item.kind,
          catalog_tags: item.tags,
        },
      ];
    });
    return [...community, ...external];
  }, [dbPlaces, mergedInternetPlaces, searchedExternalIds]);

  const filtered = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const arr = allPlaces.filter((p) => {
      const categories = p.filter_categories ?? [p.category];
      return (
        categories.some((category) => activeCats.has(category)) &&
        (p.budget === null ? budgets.size === 4 : budgets.has(p.budget)) &&
        (!q ||
          p.isSearched ||
          p.country.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q))
      );
    });
    if (sort === "popular") arr.sort((a, b) => b.reviews_count - a.reviews_count);
    else
      arr.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : parseInt(a.id.replace(/\D/g, "")) || 0;
        const tb = b.created_at ? Date.parse(b.created_at) : parseInt(b.id.replace(/\D/g, "")) || 0;
        return tb - ta;
      });
    return arr;
  }, [allPlaces, activeCats, budgets, countryQuery, sort]);

  const displayedPlaces = useMemo(() => {
    if (viewport && viewport.zoom >= 7 && countryQuery.trim().length < 2) {
      const latPad = Math.max(0.01, (viewport.north - viewport.south) * 0.08);
      const lngPad = Math.max(0.01, (viewport.east - viewport.west) * 0.08);
      return filtered
        .filter(
          (place) =>
            place.lat >= viewport.south - latPad &&
            place.lat <= viewport.north + latPad &&
            place.lng >= viewport.west - lngPad &&
            place.lng <= viewport.east + lngPad,
        )
        .slice(0, 700);
    }
    return filtered.slice(0, 700);
  }, [countryQuery, filtered, viewport]);
  const displayedOfferCount = useMemo(
    () =>
      displayedPlaces.filter((place) => (place.filter_categories ?? []).includes("deal")).length,
    [displayedPlaces],
  );

  const explorerOrigin = useMemo(() => {
    if (userPosition) return { lat: userPosition[0], lng: userPosition[1], label: "autour de toi" };
    if (!viewport) return null;
    return {
      lat: (viewport.south + viewport.north) / 2,
      lng: (viewport.west + viewport.east) / 2,
      label: countryQuery.trim() ? "près de " + countryQuery.trim() : "dans cette zone",
    };
  }, [countryQuery, userPosition, viewport]);

  const explorerResults = useMemo(() => {
    return displayedPlaces
      .map((place) => ({
        place,
        distanceKm: explorerOrigin
          ? distanceBetweenKm(explorerOrigin.lat, explorerOrigin.lng, place.lat, place.lng)
          : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm != null && b.distanceKm != null && Math.abs(a.distanceKm - b.distanceKm) > 0.15)
          return a.distanceKm - b.distanceKm;
        if (a.place.rating !== b.place.rating) return b.place.rating - a.place.rating;
        return b.place.reviews_count - a.place.reviews_count;
      })
      .slice(0, 24);
  }, [displayedPlaces, explorerOrigin]);

  const prefetchPlaceMedia = useCallback(
    async (place: AnyPlace, highPriority = false) => {
      if (place.isCommunity) {
        preloadPlaceMediaUrl(place.image_url, highPriority);
        return;
      }

      const direct = verifiedExternalImageUrl(place.image_url);
      if (direct) {
        preloadPlaceMediaUrl(direct, highPriority);
        return;
      }

      const item = placeMediaItem(place);
      const lookup = placeMediaLookup(place);
      if (!lookup) return;
      const input = catalogPlaceMediaInput(item, lookup, {
        skipGoogle: false,
        skipOfficialSite: false,
      });
      const queryKey = verifiedPlaceMediaQueryKey(place.id, input, "primary");

      const existing = mediaQueryClient.getQueryData<ResolvedPlaceMedia>(queryKey);
      if (existing?.url) {
        preloadPlaceMediaUrl(existing.url, highPriority);
        return;
      }

      const prefetchId = JSON.stringify(queryKey);
      if (PREFETCHING_PLACE_MEDIA.has(prefetchId)) return;
      const lastAttempt = ATTEMPTED_PLACE_MEDIA.get(prefetchId) ?? 0;
      if (Date.now() - lastAttempt < PLACE_MEDIA_ATTEMPT_TTL_MS) return;
      ATTEMPTED_PLACE_MEDIA.set(prefetchId, Date.now());
      PREFETCHING_PLACE_MEDIA.add(prefetchId);
      try {
        const media = await resolvePlaceMedia({ data: { ...input, fastOnly: true } });
        if (media?.url) {
          mediaQueryClient.setQueryData(queryKey, media);
          preloadPlaceMediaUrl(media.url, highPriority);
        }
      } catch {
        // Photo enrichment must never block map interactions.
      } finally {
        PREFETCHING_PLACE_MEDIA.delete(prefetchId);
      }
    },
    [mediaQueryClient, resolvePlaceMedia],
  );

  const mediaPrefetchCandidates = useMemo(() => {
    if (!viewport || viewport.zoom < 10) return [] as AnyPlace[];
    const centerLat = (viewport.south + viewport.north) / 2;
    const centerLng = (viewport.west + viewport.east) / 2;
    const limit = viewport.zoom >= 13 ? 6 : viewport.zoom >= 11 ? 4 : 2;
    return displayedPlaces
      .filter((place) => !place.isCommunity)
      .map((place) => ({
        place,
        d:
          (place.lat - centerLat) ** 2 +
          ((place.lng - centerLng) * Math.cos((centerLat * Math.PI) / 180)) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map((entry) => entry.place);
  }, [displayedPlaces, viewport]);

  useEffect(() => {
    if (!mediaPrefetchCandidates.length) return;
    let cancelled = false;
    const queue = [...mediaPrefetchCandidates];
    const timer = window.setTimeout(() => {
      const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
        while (!cancelled) {
          const place = queue.shift();
          if (!place) return;
          await prefetchPlaceMedia(place, false);
        }
      });
      void Promise.allSettled(workers);
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mediaPrefetchCandidates, prefetchPlaceMedia]);

  const { data: locatedTravelers = [] } = useQuery({
    queryKey: ["located-travelers", user?.id],
    queryFn: fetchLocatedTravelers,
    staleTime: 60_000,
  });

  const filteredTravelers = useMemo(() => {
    if (!showTravelers) return [];
    const q = countryQuery.trim().toLowerCase();
    return locatedTravelers.filter(
      (t) => !q || t.country.toLowerCase().includes(q) || t.city.toLowerCase().includes(q),
    );
  }, [locatedTravelers, countryQuery, showTravelers]);

  const selectAllMapContent = () => {
    setActiveCats(new Set(ALL_PLACE_CATEGORIES));
    setShowTravelers(true);
  };

  const toggleCat = (v: string) => {
    const everyPlaceCategorySelected =
      activeCats.size === ALL_PLACE_CATEGORIES.length &&
      ALL_PLACE_CATEGORIES.every((category) => activeCats.has(category));
    if (everyPlaceCategorySelected) {
      setActiveCats(new Set([v]));
      setShowTravelers(false);
      return;
    }
    setActiveCats((current) => {
      const next = new Set(current);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      if (next.size === 0 && !showTravelers) return new Set(ALL_PLACE_CATEGORIES);
      return next;
    });
  };

  const toggleTravelers = () => {
    const everyPlaceCategorySelected =
      activeCats.size === ALL_PLACE_CATEGORIES.length &&
      ALL_PLACE_CATEGORIES.every((category) => activeCats.has(category));
    if (everyPlaceCategorySelected && showTravelers) {
      setActiveCats(new Set());
      setShowTravelers(true);
      return;
    }
    if (activeCats.size === 0 && showTravelers) {
      selectAllMapContent();
      return;
    }
    setShowTravelers((value) => !value);
  };

  const toggleBudget = (b: 1 | 2 | 3 | 4) => {
    setBudgets((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      if (n.size === 0) return new Set([1, 2, 3, 4]);
      return n;
    });
  };

  const submitMapSearch = () => {
    const query = searchDraft.trim();
    setCountryQuery(query);
    if (!query) toast.message("Déplace la carte ou recherche une destination");
  };

  const refreshVisibleArea = () => {
    if (!viewport || viewport.zoom < 5) {
      toast.message("Zoome sur une ville ou une région pour charger les lieux");
      return;
    }
    void Promise.all([
      refetchPersistedViewport(),
      viewport.zoom >= 7 ? refetchFastViewport() : Promise.resolve(),
      refetchLiveViewport(),
    ]);
    toast.message("Actualisation de cette zone…");
  };

  const primaryCategories = MAP_PLACE_CATEGORIES.filter((category) =>
    PRIMARY_PLACE_CATEGORIES.has(category.value),
  );
  const allCategoriesSelected =
    activeCats.size === ALL_PLACE_CATEGORIES.length &&
    ALL_PLACE_CATEGORIES.every((category) => activeCats.has(category));
  const allContentSelected = allCategoriesSelected && showTravelers;
  const secondaryCategorySelected = SECONDARY_PLACE_CATEGORIES.some((category) =>
    activeCats.has(category.value),
  );

  return (
    <div className="app-page min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-[1600px] px-2 pb-4 pt-2 sm:px-4 sm:pb-6 sm:pt-4">
        <div className="surface-card relative z-20 rounded-[1.6rem] p-2.5 shadow-soft sm:p-3">
          <div className="flex items-center gap-2">
            <form
              className="relative min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                submitMapSearch();
              }}
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Rechercher une ville, un restaurant, une activité…"
                className="h-12 rounded-full border-border/70 bg-background pl-11 pr-12 text-sm shadow-sm sm:h-13 sm:text-base"
              />
              {(searchDraft || countryQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDraft("");
                    setCountryQuery("");
                  }}
                  className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>
            <Button
              type="button"
              variant={showFilters ? "default" : "outline"}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full sm:hidden"
              onClick={() => setShowFilters((value) => !value)}
              aria-label="Filtres"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <Button asChild variant="outline" className="hidden h-11 rounded-full px-4 sm:inline-flex">
              <Link to="/match">
                <Sparkles className="mr-2 h-4 w-4 text-accent" /> Travel Match
              </Link>
            </Button>
            <Button
              type="button"
              variant={showFilters ? "default" : "outline"}
              className="hidden h-11 rounded-full px-4 sm:inline-flex"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Filtres
            </Button>
          </div>

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              onClick={selectAllMapContent}
              className={[
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                allContentSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-background hover:border-primary/40",
              ].join(" ")}
            >
              Tout
            </button>
            <button
              onClick={toggleTravelers}
              className={[
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                showTravelers
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground",
              ].join(" ")}
            >
              <Users className="h-3.5 w-3.5" /> Voyageurs
            </button>
            {primaryCategories.map((category) => {
              const on = activeCats.has(category.value);
              return (
                <button
                  key={category.value}
                  onClick={() => toggleCat(category.value)}
                  className={[
                    "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                    on
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-background hover:border-primary/40",
                  ].join(" ")}
                >
                  <span>{category.emoji}</span> {category.label}
                </button>
              );
            })}
            <button
              onClick={() => setShowMoreCategories((value) => !value)}
              className={[
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                showMoreCategories || secondaryCategorySelected
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border bg-background",
              ].join(" ")}
            >
              <Plus className="h-3.5 w-3.5" /> Plus
            </button>
          </div>

          {showMoreCategories && (
            <div className="mt-2 flex gap-2 overflow-x-auto border-t border-border/60 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
              {SECONDARY_PLACE_CATEGORIES.map((category) => {
                const on = activeCats.has(category.value);
                return (
                  <button
                    key={category.value}
                    onClick={() => toggleCat(category.value)}
                    className={[
                      "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    <span>{category.emoji}</span> {category.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {showFilters && (
          <div className="surface-card relative z-10 mt-2 grid gap-3 rounded-[1.35rem] p-3 sm:grid-cols-[1fr_auto_auto] sm:p-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recherche active
              </div>
              <div className="flex min-h-9 items-center rounded-xl bg-secondary/70 px-3 text-sm">
                {countryQuery ? `« ${countryQuery} »` : "Zone visible de la carte"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Budget
              </div>
              <div className="flex gap-1">
                {([1, 2, 3, 4] as const).map((budget) => (
                  <button
                    key={budget}
                    onClick={() => toggleBudget(budget)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm font-semibold transition",
                      budgets.has(budget)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground",
                    ].join(" ")}
                  >
                    {BUDGET_LABELS[budget - 1]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Trier
              </div>
              <div className="flex gap-1">
                {(["popular", "recent"] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => setSort(key)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                      sort === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground",
                    ].join(" ")}
                  >
                    {key === "popular" ? "Populaires" : "Récents"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(internetError || viewportError) && (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Certaines données temps réel répondent lentement. GlobeLink affiche le cache disponible
            et continue l’actualisation en arrière-plan.
          </div>
        )}

        <div className="mt-2 grid gap-2 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="surface-card hidden h-[calc(100dvh-13.5rem)] min-h-[600px] overflow-hidden rounded-[1.6rem] lg:flex lg:flex-col">
            <div className="border-b border-border/70 p-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Explorer</div>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">À découvrir {explorerOrigin?.label ?? "ici"}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Photos, notes, distance et sources fiables dans la zone de la carte.</p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{explorerResults.length}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
              {explorerResults.length ? (
                explorerResults.map((entry) => (
                  <ExplorerPlaceCard
                    key={entry.place.id}
                    entry={entry}
                    onSelect={(place) => setSelected(place)}
                    onPrefetch={(place) => void prefetchPlaceMedia(place, true)}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Déplace la carte ou recherche une destination pour voir les meilleures adresses de la zone.
                </div>
              )}
            </div>
          </aside>

          <div className="map-canvas-shell surface-card relative h-[68dvh] min-h-[520px] min-w-0 overflow-hidden rounded-[1.6rem] p-1 shadow-soft sm:h-[calc(100dvh-13.5rem)] sm:min-h-[600px] sm:rounded-[2rem] sm:p-1.5">
          <ClientOnly
            fallback={
              <div className="grid h-full place-items-center rounded-[1.35rem] bg-secondary text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Chargement de la carte…
              </div>
            }
          >
            <LeafletMap
              places={displayedPlaces}
              travelers={filteredTravelers}
              onSelect={(place) => setSelected(place)}
              onPrefetch={(place) => void prefetchPlaceMedia(place, true)}
              onTraveler={setSelectedTraveler}
              onCountry={setSelectedCountry}
              userPosition={userPosition}
              userAccuracy={userAccuracy}
              autoFit={countryQuery.trim().length >= 2}
              onViewportChange={setViewport}
            />
          </ClientOnly>

          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex max-w-[calc(100%-1.5rem)] items-center gap-2 sm:left-4 sm:top-4">
            <div className="rounded-full border border-white/70 bg-background/95 px-3 py-2 text-xs font-bold shadow-elevated backdrop-blur sm:text-sm">
              {displayedPlaces.length} lieux
            </div>
            {displayedOfferCount > 0 && (
              <div className="hidden rounded-full border border-orange-200 bg-orange-50/95 px-3 py-2 text-xs font-semibold text-orange-700 shadow-soft backdrop-blur sm:block">
                🔥 {displayedOfferCount} offres
              </div>
            )}
            {showTravelers && filteredTravelers.length > 0 && (
              <div className="hidden rounded-full border border-pink-200 bg-pink-50/95 px-3 py-2 text-xs font-semibold text-pink-700 shadow-soft backdrop-blur md:block">
                👤 {filteredTravelers.length} voyageurs
              </div>
            )}
          </div>

          {viewport && viewport.zoom >= 5 && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-[510] -translate-x-1/2 sm:top-4">
              <Button
                size="sm"
                variant="secondary"
                className="pointer-events-auto rounded-full border border-border/70 bg-background/95 px-4 shadow-elevated backdrop-blur hover:bg-background"
                onClick={refreshVisibleArea}
                disabled={viewportRefreshing}
              >
                {viewportRefreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Rechercher dans cette zone
              </Button>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-4 left-3 z-[500] flex flex-col gap-2 sm:left-4">
            <Button
              size="sm"
              variant={userPosition ? "default" : "secondary"}
              className="pointer-events-auto rounded-full border border-border/70 bg-background/95 px-3 shadow-elevated backdrop-blur"
              onClick={() => locateMe(false)}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="mr-2 h-4 w-4" />
              )}
              {effectiveAccountSettings.precise_location && effectiveAccountSettings.use_location
                ? "Ma position précise"
                : "Ma position"}
            </Button>
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="pointer-events-auto rounded-full border border-border/70 bg-background/95 px-3 shadow-elevated backdrop-blur sm:hidden"
            >
              <Link to="/match">
                <Sparkles className="mr-2 h-4 w-4" /> Match
              </Link>
            </Button>
          </div>

          {(viewportRefreshing || searchingInternet || internetLoading) && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-border/60 bg-background/95 px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-soft backdrop-blur sm:text-xs">
              <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin text-primary" />
              {displayedPlaces.length > 0
                ? "Mise à jour en arrière-plan…"
                : "Chargement des lieux…"}
            </div>
          )}
          </div>
        </div>

        {explorerResults.length > 0 && (
          <section className="mt-2 lg:hidden">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Explorer</div>
                <h2 className="font-display text-lg font-bold">À découvrir {explorerOrigin?.label ?? "ici"}</h2>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{explorerResults.length}</span>
            </div>
            <div className="flex snap-x gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {explorerResults.slice(0, 12).map((entry) => (
                <ExplorerPlaceCard
                  key={entry.place.id}
                  entry={entry}
                  mobile
                  onSelect={(place) => setSelected(place)}
                  onPrefetch={(place) => void prefetchPlaceMedia(place, true)}
                />
              ))}
            </div>
          </section>
        )}

        <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground sm:text-xs">
          <span>
            {viewport && viewport.zoom >= 5
              ? `${displayedPlaces.length} lieux dans la zone · déplace ou zoome pour explorer ailleurs`
              : "Zoome sur une ville pour afficher restaurants, hôtels, activités et voyageurs."}
          </span>
          <span className="hidden sm:inline">Données GlobeLink + OpenStreetMap</span>
        </div>

        <PlaceSheet place={selected} onOpenChange={(open) => !open && setSelected(null)} />
        <TravelerSheet
          traveler={selectedTraveler}
          onOpenChange={(open) => !open && setSelectedTraveler(null)}
        />
        <CountrySheet
          code={selectedCountry}
          onOpenChange={(open) => !open && setSelectedCountry(null)}
        />
      </main>
    </div>
  );
}

function viewportZoomFromMap(map: any) {
  const zoom = Number(map?.getZoom?.());
  return Number.isFinite(zoom) ? zoom : 2;
}

function viewportFromLeafletMap(map: any): MapViewport | null {
  if (!map?.getBounds || !map?.getZoom) return null;
  const bounds = map.getBounds();
  const south = Number(bounds?.getSouth?.());
  const west = Number(bounds?.getWest?.());
  const north = Number(bounds?.getNorth?.());
  const east = Number(bounds?.getEast?.());
  const zoom = Number(map.getZoom());
  if (![south, west, north, east, zoom].every(Number.isFinite)) return null;
  return {
    south: Math.max(-85, south),
    west: Math.max(-180, west),
    north: Math.min(85, north),
    east: Math.min(180, east),
    zoom,
  };
}

type UseMapEventsHook = (typeof import("react-leaflet"))["useMapEvents"];

function ViewportReporter({
  useMapEventsHook,
  onViewportChange,
}: {
  useMapEventsHook: UseMapEventsHook;
  onViewportChange: (viewport: MapViewport) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = (map: any, delay = 220) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const next = viewportFromLeafletMap(map);
      if (next) onViewportChange(next);
    }, delay);
  };

  const map = useMapEventsHook({
    moveend: (event: any) => schedule(event.target),
    zoomend: (event: any) => schedule(event.target),
  });

  useEffect(() => {
    schedule(map, 0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [map, onViewportChange]);

  return null;
}

function clusterPlaces(places: AnyPlace[], zoom: number) {
  const cell =
    zoom <= 3
      ? 12
      : zoom <= 5
        ? 4
        : zoom <= 7
          ? 1.4
          : zoom <= 9
            ? 0.45
            : zoom <= 11
              ? 0.12
              : zoom <= 13
                ? 0.035
                : zoom <= 14
                  ? 0.015
                  : 0;
  if (!cell)
    return places.map((place) => ({
      key: place.id,
      lat: place.lat,
      lng: place.lng,
      places: [place],
    }));
  const groups = new Map<string, AnyPlace[]>();
  for (const place of places) {
    const key = `${Math.floor((place.lat + 90) / cell)}:${Math.floor((place.lng + 180) / cell)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(place);
    else groups.set(key, [place]);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({
    key: `cluster-${key}`,
    lat: group.reduce((sum, place) => sum + place.lat, 0) / group.length,
    lng: group.reduce((sum, place) => sum + place.lng, 0) / group.length,
    places: group,
  }));
}

function countLoadedPlacesNearHub(hub: { lat: number; lng: number }, places: AnyPlace[]) {
  const latRadius = 1.15;
  const lngRadius = Math.min(2.2, 1.35 / Math.max(0.35, Math.cos((hub.lat * Math.PI) / 180)));
  let count = 0;
  for (const place of places) {
    if (Math.abs(place.lat - hub.lat) <= latRadius && Math.abs(place.lng - hub.lng) <= lngRadius)
      count += 1;
  }
  return count;
}

function LeafletMap({
  places,
  travelers,
  onSelect,
  onPrefetch,
  onTraveler,
  onCountry,
  userPosition,
  userAccuracy,
  autoFit,
  onViewportChange,
}: {
  places: AnyPlace[];
  travelers: LocatedTraveler[];
  onSelect: (p: AnyPlace) => void;
  onPrefetch: (p: AnyPlace) => void;
  onTraveler: (t: LocatedTraveler) => void;
  onCountry: (code: string) => void;
  userPosition: [number, number] | null;
  userAccuracy: number | null;
  autoFit: boolean;
  onViewportChange: (viewport: MapViewport) => void;
}) {
  const [Mod, setMod] = useState<typeof import("react-leaflet") | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([rl, leaf]) => {
      setL(leaf);
      setMod(rl);
    });
  }, []);

  useEffect(() => {
    if (userPosition && mapRef.current) {
      mapRef.current.flyTo(userPosition, 13, { duration: 0.9 });
    }
  }, [userPosition]);

  useEffect(() => {
    if (!autoFit || userPosition || !mapRef.current || !places.length) return;
    const points = places.slice(0, 180).map((place) => [place.lat, place.lng] as [number, number]);
    if (points.length === 1) mapRef.current.flyTo(points[0], 12, { duration: 0.7 });
    else
      mapRef.current.fitBounds(points, {
        padding: [32, 32],
        maxZoom: 12,
        animate: true,
        duration: 0.7,
      });
  }, [autoFit, places, userPosition]);

  if (!Mod || !L)
    return (
      <div className="grid h-full place-items-center bg-secondary text-muted-foreground">
        Chargement…
      </div>
    );
  const { MapContainer, TileLayer, Marker, ZoomControl, Circle, Tooltip, useMapEvents } = Mod;
  const currentZoom = viewportZoomFromMap(mapRef.current);
  const placeClusters = clusterPlaces(places, currentZoom);

  return (
    <MapContainer
      ref={mapRef}
      center={[20, 0]}
      zoom={2}
      className="h-full w-full"
      scrollWheelZoom
      worldCopyJump
      zoomControl={false}
    >
      <ViewportReporter useMapEventsHook={useMapEvents} onViewportChange={onViewportChange} />
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />

      {userPosition && userAccuracy && (
        <Circle
          center={userPosition}
          radius={userAccuracy}
          pathOptions={{ color: "#0ea5e9", fillColor: "#38bdf8", fillOpacity: 0.08, weight: 1 }}
        />
      )}
      {userPosition &&
        (() => {
          const icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:38px;height:38px;display:grid;place-items:center;"><span style="position:absolute;inset:0;border-radius:999px;background:rgba(14,165,233,.20);animation:marker-pulse 1.8s ease-out infinite"></span><span style="position:relative;width:19px;height:19px;border-radius:999px;background:#0ea5e9;border:4px solid white;box-shadow:0 6px 18px rgba(2,132,199,.38)"></span></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          });
          return <Marker position={userPosition} icon={icon} zIndexOffset={1000} />;
        })()}

      {currentZoom <= 4 &&
        COUNTRY_INFO.map((c) => {
          const icon = L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:oklch(0.24 0.06 240);color:white;box-shadow:0 8px 20px rgba(0,0,0,0.35);font-weight:600;font-size:12px;white-space:nowrap;border:2px solid white;"><span style="font-size:14px;">${c.emoji}</span>${c.name}</div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });
          return (
            <Marker
              key={"country-" + c.code}
              position={c.center as [number, number]}
              icon={icon}
              eventHandlers={{ click: () => onCountry(c.code) }}
            />
          );
        })}

      {currentZoom <= 5 &&
        WORLD_MAP_HUBS.map((hub) => {
          const knownCount = countLoadedPlacesNearHub(hub, places);
          const compactCount = knownCount > 99 ? "99+" : knownCount > 0 ? String(knownCount) : "";
          const size = currentZoom <= 2 ? 20 : currentZoom <= 3 ? 24 : 28;
          const icon = L.divIcon({
            className: "",
            html: `<div title="Explorer ${escapeHtml(hub.city)}" aria-label="Explorer ${escapeHtml(hub.city)}" style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:999px;background:#0789a8;color:white;border:2px solid white;box-shadow:0 4px 13px rgba(2,132,199,.34);font:800 ${currentZoom <= 2 ? 9 : 10}px/1 system-ui,sans-serif;cursor:pointer;">${compactCount || '<span style="width:6px;height:6px;border-radius:999px;background:white;display:block"></span>'}</div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          return (
            <Marker
              key={`world-hub-${hub.id}`}
              position={[hub.lat, hub.lng]}
              icon={icon}
              zIndexOffset={knownCount > 0 ? 160 : 80}
              eventHandlers={{
                click: () =>
                  mapRef.current?.flyTo([hub.lat, hub.lng], hub.zoom ?? 10, { duration: 0.65 }),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.96}>
                <span>
                  {hub.city}, {hub.country}
                  {knownCount > 0
                    ? ` · ${knownCount} lieux déjà chargés`
                    : " · cliquer pour explorer"}
                </span>
              </Tooltip>
            </Marker>
          );
        })}

      {placeClusters.map((cluster) => {
        if (cluster.places.length > 1) {
          const icon = L.divIcon({
            className: "",
            html: `<div title="${cluster.places.length} lieux" style="display:grid;place-items:center;min-width:42px;height:42px;padding:0 10px;border-radius:999px;background:oklch(0.55 0.12 220);color:white;border:3px solid white;box-shadow:0 6px 18px rgba(0,0,0,.28);font:800 13px/1 sans-serif;">${cluster.places.length}</div>`,
            iconSize: [48, 42],
            iconAnchor: [24, 21],
          });
          return (
            <Marker
              key={cluster.key}
              position={[cluster.lat, cluster.lng]}
              icon={icon}
              eventHandlers={{
                click: () =>
                  mapRef.current?.flyTo([cluster.lat, cluster.lng], Math.min(15, currentZoom + 2), {
                    duration: 0.55,
                  }),
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
                {cluster.places.length} lieux · clique pour zoomer
              </Tooltip>
            </Marker>
          );
        }
        const p = cluster.places[0];
        const cat = mapCategoryMeta(p.marker_category || p.category);
        const offer = isOfferPlace(p);
        const title = escapeHtml(`${cat?.label ?? "Lieu"} · ${p.name}`);
        const showName = currentZoom >= 14;
        const safeName = escapeHtml(p.name);
        const icon = L.divIcon({
          className: "",
          html: `<div title="${title}" aria-label="${title}" style="position:relative;display:flex;align-items:center;height:40px;white-space:nowrap;">
            <span style="position:relative;display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:50%;background:white;border:2px solid oklch(0.55 0.12 220);box-shadow:0 4px 12px rgba(0,0,0,0.25);font-size:19px;">
              <span>${cat?.emoji ?? "📍"}</span>
              ${offer ? '<span style="position:absolute;right:-5px;top:-6px;display:grid;place-items:center;width:18px;height:18px;border-radius:999px;background:#f97316;color:white;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25);font-size:10px;line-height:1;">🔥</span>' : ""}
            </span>
            ${showName ? `<span style="margin-left:5px;max-width:150px;overflow:hidden;text-overflow:ellipsis;padding:5px 8px;border-radius:8px;background:rgba(255,255,255,.94);border:1px solid rgba(15,23,42,.10);box-shadow:0 3px 10px rgba(0,0,0,.16);color:#102027;font:700 11px/1.2 system-ui,sans-serif;">${safeName}</span>` : ""}
          </div>`,
          iconSize: showName ? [195, 40] : [38, 40],
          iconAnchor: [19, 20],
        });
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icon}
            eventHandlers={{
              mouseover: () => onPrefetch(p),
              mousedown: () => onPrefetch(p),
              click: () => onSelect(p),
            }}
          >
            <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
              <span>
                {offer ? "Offre · " : ""}
                {cat?.label ?? "Lieu"} · {p.name}
              </span>
            </Tooltip>
          </Marker>
        );
      })}

      {travelers.map((t) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:44px;height:44px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,0.35),transparent 70%);animation:pulse 2s infinite;"></div>
            ${
              t.avatar
                ? `<img src="${t.avatar}" style="position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.35);"/>`
                : `<div style="position:absolute;inset:4px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:oklch(0.55 0.12 220);color:white;font:600 14px/1 sans-serif;border:2px solid white;">${(t.name || t.username).slice(0, 1).toUpperCase()}</div>`
            }
          </div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        return (
          <Marker
            key={"trav-" + t.id}
            position={[t.lat, t.lng]}
            icon={icon}
            eventHandlers={{ click: () => onTraveler(t) }}
          />
        );
      })}
    </MapContainer>
  );
}

function ExplorerPlaceCard({
  entry,
  onSelect,
  onPrefetch,
  mobile = false,
}: {
  entry: { place: AnyPlace; distanceKm: number | null };
  onSelect: (place: AnyPlace) => void;
  onPrefetch: (place: AnyPlace) => void;
  mobile?: boolean;
}) {
  const { place, distanceKm } = entry;
  const cat = mapCategoryMeta(place.marker_category || place.category);
  const price = place.price_text || (place.budget ? BUDGET_LABELS[place.budget - 1] : null);
  const openState = placeOpenState(place);
  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      onPointerEnter={() => onPrefetch(place)}
      onTouchStart={() => onPrefetch(place)}
      className={[
        "group overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-sm transition hover:border-primary/30 hover:shadow-soft",
        mobile ? "w-[84vw] max-w-[340px] shrink-0 snap-start" : "w-full",
      ].join(" ")}
    >
      <div className="grid grid-cols-[108px_minmax(0,1fr)]">
        <CatalogImage
          item={placeMediaItem(place)}
          lookup={placeMediaLookup(place)}
          className="h-full min-h-[118px] w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          placeholderClassName="h-full min-h-[118px] w-full"
        />
        <div className="min-w-0 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>{cat?.emoji ?? "📍"}</span>
            <span className="truncate">{cat?.label ?? "Lieu"}</span>
            {isOfferPlace(place) && <span className="text-orange-500">· Offre</span>}
          </div>
          <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-bold leading-tight">{place.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
            {place.rating > 0 && (
              <span className="inline-flex items-center gap-0.5 font-semibold">
                {place.rating.toFixed(1)} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              </span>
            )}
            {distanceKm != null && Number.isFinite(distanceKm) && (
              <span className="text-muted-foreground">· {distanceKm < 1 ? String(Math.max(50, Math.round(distanceKm * 1000 / 50) * 50)) + " m" : distanceKm.toFixed(distanceKm < 10 ? 1 : 0) + " km"}</span>
            )}
            {price && <span className="font-semibold text-foreground">· {price}</span>}
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{[place.city, place.country].filter(Boolean).join(", ") || "Position sur la carte"}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
            <span className={openState === "Ouvert" ? "font-semibold text-emerald-600 dark:text-emerald-400" : openState === "Fermé" ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>
              {openState || (place.hours && !/à vérifier|non renseignés/i.test(place.hours) ? place.hours.slice(0, 34) : "Horaires sur la source")}
            </span>
            <span className="max-w-[45%] truncate font-medium text-primary">{place.provider || "GlobeLink"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function catalogTagText(place: AnyPlace | null, key: string) {
  const value = place?.catalog_tags?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function placeOpenState(place: AnyPlace | null) {
  const raw = place?.catalog_tags?.open_now ?? place?.catalog_tags?.is_open;
  if (raw === true || raw === "true" || raw === "open") return "Ouvert";
  if (raw === false || raw === "false" || raw === "closed") return "Fermé";
  return null;
}

function placeWebsite(place: AnyPlace | null) {
  return catalogTagText(place, "official_website") || catalogTagText(place, "website");
}

function placePhone(place: AnyPlace | null) {
  return catalogTagText(place, "phone");
}

function placeAddress(place: AnyPlace | null) {
  return (
    catalogTagText(place, "address") || [place?.city, place?.country].filter(Boolean).join(", ")
  );
}

function directionsUrl(place: AnyPlace) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`;
}

function PlaceSheet({
  place,
  onOpenChange,
}: {
  place: AnyPlace | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [addingTripId, setAddingTripId] = useState<string | null>(null);
  useEffect(() => {
    setSaved(false);
    setTripPickerOpen(false);
  }, [place?.id]);

  const { data: trips = [], isLoading: tripsLoading, isError: tripsError, refetch: refetchTrips } = useQuery({
    queryKey: ["explorer-trips", user?.id],
    enabled: !!user && !!place && tripPickerOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id,title,city,country,starts_on,ends_on,status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addToTrip = async (trip: (typeof trips)[number]) => {
    if (!place || !user || addingTripId) return;
    setAddingTripId(trip.id);
    try {
      const { data: existing } = await supabase
        .from("trip_entries")
        .select("id")
        .eq("trip_id", trip.id)
        .eq("title", place.name)
        .limit(1)
        .maybeSingle();
      if (existing) {
        setSaved(true);
        setTripPickerOpen(false);
        toast.message("Ce lieu est déjà dans ce voyage", {
          description: "Ouvre le carnet pour continuer l’organisation.",
          action: {
            label: "Ouvrir le voyage",
            onClick: () => window.location.assign("/trips/" + trip.id),
          },
        });
        return;
      }
      const visitDate = trip.starts_on || new Date().toISOString().slice(0, 10);
      const kind = place.category === "hotel" ? "hotel" : place.category === "restaurant" ? "restaurant" : "activity";
      const sourceNote = [
        "Ajouté depuis Explorer · " + (place.provider || "GlobeLink"),
        place.source_url ? "Source : " + place.source_url : null,
      ].filter(Boolean).join("\n");
      const { error } = await supabase.from("trip_entries").insert({
        trip_id: trip.id,
        user_id: user.id,
        kind,
        title: place.name,
        city: place.city || null,
        country: place.country || null,
        notes: sourceNote,
        lat: place.lat,
        lng: place.lng,
        price_level: place.budget,
        rating: place.rating || null,
        visited_on: visitDate,
        position: Math.floor(Date.now() % 2_000_000_000),
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["trip-entries", trip.id] });
      await qc.invalidateQueries({ queryKey: ["trips", user.id] });
      setSaved(true);
      setTripPickerOpen(false);
      toast.success("Ajouté à " + trip.title, {
        description: "Le lieu est maintenant dans ton carnet.",
        action: {
          label: "Ouvrir le voyage",
          onClick: () => window.location.assign("/trips/" + trip.id),
        },
      });
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d’ajouter ce lieu au voyage.");
    } finally {
      setAddingTripId(null);
    }
  };

  const share = async () => {
    if (!place) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share)
        await navigator.share({ title: place.name, text: place.description, url });
      else {
        await navigator.clipboard.writeText(`${place.name} — ${url}`);
        toast.success("Lien copié");
      }
    } catch {
      /* cancelled */
    }
  };

  const cat = place ? mapCategoryMeta(place.marker_category || place.category) : null;
  const offer = place ? isOfferPlace(place) : false;
  const approximateExternalPosition = place?.catalog_tags?.location_precision === "search-area";
  const website = placeWebsite(place);
  const phone = placePhone(place);
  const address = placeAddress(place);
  const cuisine = catalogTagText(place, "cuisine");

  return (
    <Sheet open={!!place} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] overflow-hidden rounded-t-[2rem] border-t p-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[480px] sm:max-w-[480px] sm:rounded-none sm:border-l sm:border-t-0"
      >
        {place && (
          <div className="h-full overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted-foreground/20 sm:hidden" />

            <CatalogImage
              item={placeMediaItem(place)}
              lookup={placeMediaLookup(place)}
              priority
              showAttribution
              className="mt-2 h-48 w-full object-cover sm:mt-0 sm:h-60"
              placeholderClassName="mt-2 h-24 w-full sm:mt-0 sm:h-28"
            />

            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="rounded-full">
                  {cat?.emoji} {cat?.label ?? "Lieu"}
                </Badge>
                {offer && <Badge className="rounded-full bg-orange-500 text-white">🔥 Offre</Badge>}
                {place.isCommunity && <Badge className="rounded-full">GlobeLink</Badge>}
              </div>

              <SheetHeader className="mt-3 p-0 text-left">
                <SheetTitle className="font-display text-2xl leading-tight sm:text-3xl">
                  {place.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {place.rating > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    {place.rating.toFixed(1)}{" "}
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    {place.reviews_count > 0 && (
                      <span className="font-normal text-muted-foreground">
                        ({place.reviews_count})
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Pas encore noté</span>
                )}
                {place.budget && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-semibold">{BUDGET_LABELS[place.budget - 1]}</span>
                  </>
                )}
                {cuisine && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="capitalize text-muted-foreground">
                      {cuisine.replace(/;/g, ", ")}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {address || "Adresse non renseignée"}
                  {approximateExternalPosition ? " · position approximative" : ""}
                </span>
              </div>
              <div className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{place.hours}</span>
              </div>

              <Button
                className="mt-5 h-12 w-full rounded-2xl text-sm font-bold shadow-soft"
                onClick={() => {
                  if (!user) {
                    toast.info("Connecte-toi pour ajouter ce lieu à un voyage.");
                    const redirect = window.location.pathname + window.location.search;
                    window.location.assign("/auth?redirect=" + encodeURIComponent(redirect));
                    return;
                  }
                  setTripPickerOpen((open) => !open);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                {saved ? "Ajouté à mon voyage" : "Ajouter à mon voyage"}
              </Button>

              {tripPickerOpen && (
                <div
                  data-testid="explorer-trip-picker"
                  className="mt-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-3 shadow-soft"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">Ajouter à quel voyage ?</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Choisis le carnet où enregistrer ce lieu.</p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fermer le choix du voyage"
                      onClick={() => setTripPickerOpen(false)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {tripsLoading ? (
                    <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Chargement de tes voyages…
                    </div>
                  ) : tripsError ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Impossible de charger tes voyages pour le moment.</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 rounded-full"
                        onClick={() => void refetchTrips()}
                      >
                        Réessayer
                      </Button>
                    </div>
                  ) : trips.length ? (
                    <div className="max-h-[34dvh] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                      {trips.map((trip) => (
                        <button
                          key={trip.id}
                          type="button"
                          disabled={!!addingTripId}
                          onClick={() => void addToTrip(trip)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition active:scale-[0.99] disabled:opacity-60"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{trip.title}</div>
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}
                              {trip.starts_on
                                ? " · dès le " + new Date(trip.starts_on + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
                                : ""}
                            </div>
                          </div>
                          {addingTripId === trip.id ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : (
                            <Plus className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-card/60 p-4 text-center">
                      <p className="text-sm font-semibold">Tu n’as pas encore de voyage.</p>
                      <p className="mt-1 text-xs text-muted-foreground">Crée ton premier carnet puis reviens ajouter ce lieu.</p>
                      <Button asChild size="sm" className="mt-3 rounded-full">
                        <Link to="/trips">Créer mon voyage</Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Button
                  asChild
                  className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl py-2.5"
                >
                  <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer">
                    <Navigation className="h-4 w-4" />
                    <span className="text-xs">Itinéraire</span>
                  </a>
                </Button>
                <Button
                  asChild
                  className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 py-2.5 text-white shadow-soft hover:text-white hover:opacity-95"
                >
                  <Link to="/ai-pro">
                    <Crown className="h-4 w-4" />
                    <span className="text-xs">IA+</span>
                  </Link>
                </Button>
                <Button
                  variant={saved ? "default" : "outline"}
                  className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl py-2.5"
                  onClick={() => {
                    setSaved((value) => !value);
                    toast.success(saved ? "Retiré des favoris" : "Ajouté aux favoris");
                  }}
                >
                  <Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
                  <span className="text-xs">{saved ? "Enregistré" : "Enregistrer"}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl py-2.5"
                  onClick={share}
                >
                  <Share2 className="h-4 w-4" />
                  <span className="text-xs">Partager</span>
                </Button>
                {phone && (
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl py-2.5"
                  >
                    <a href={`tel:${phone}`}>
                      <Phone className="h-4 w-4" />
                      <span className="text-xs">Appeler</span>
                    </a>
                  </Button>
                )}
                {website && (
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto min-w-[82px] shrink-0 flex-col gap-1 rounded-2xl py-2.5"
                  >
                    <a href={website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      <span className="text-xs">Site</span>
                    </a>
                  </Button>
                )}
              </div>

              {place.description &&
                !/Informations issues de la source externe/i.test(place.description) && (
                  <div className="mt-6 border-t border-border/70 pt-5">
                    <h3 className="text-sm font-semibold">À propos</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {place.description}
                    </p>
                  </div>
                )}

              {place.photos.length > 0 && (
                <div className="mt-6 border-t border-border/70 pt-5">
                  <h3 className="mb-3 text-sm font-semibold">Photos vérifiées</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {place.photos.slice(0, 6).map((src, index) => (
                      <div
                        key={`${src}-${index}`}
                        className="aspect-square overflow-hidden rounded-xl bg-secondary"
                      >
                        <img src={src} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> GlobeLink autour de ce lieu
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Utilise Travel Match pour découvrir les voyageurs présents dans cette zone et
                  organise une sortie autour de ce lieu.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 rounded-full bg-background">
                  <Link to="/match">Voir Travel Match</Link>
                </Button>
              </div>

              {!place.isCommunity && (
                <div className="mt-5 rounded-2xl border border-border bg-secondary/45 p-3 text-xs leading-relaxed text-muted-foreground">
                  Informations importées depuis {place.provider || "une source externe"}. Les
                  horaires et disponibilités peuvent évoluer.
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {place.source_url && (
                      <a
                        href={place.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        Source originale ↗
                      </a>
                    )}
                    {place.booking_url && place.booking_url !== website && (
                      <a
                        href={place.booking_url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="font-semibold text-primary hover:underline"
                      >
                        Réserver ↗
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>

      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-3xl sm:w-full">
          <DialogHeader>
            <DialogTitle>Ajouter à quel voyage ?</DialogTitle>
          </DialogHeader>
          {trips.length ? (
            <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  disabled={!!addingTripId}
                  onClick={() => void addToTrip(trip)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40 disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{trip.title}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage GlobeLink"}
                      {trip.starts_on ? " · dès le " + new Date(trip.starts_on + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}
                    </div>
                  </div>
                  {addingTripId === trip.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> : <Plus className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">Crée d’abord un voyage pour y enregistrer ce lieu.</p>
              <Button asChild className="mt-4 rounded-full">
                <Link to="/trips">Créer mon voyage</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

function TravelerSheet({
  traveler,
  onOpenChange,
}: {
  traveler: LocatedTraveler | null;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={!!traveler} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
        {traveler && (
          <div>
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-pink-500 to-purple-600">
              {traveler.avatar && (
                <img
                  src={traveler.avatar}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-40 blur-xl"
                />
              )}
              <div className="absolute inset-0 flex items-end p-5">
                <div className="flex items-end gap-4">
                  {traveler.avatar ? (
                    <img
                      src={traveler.avatar}
                      alt={traveler.name}
                      className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-elevated"
                    />
                  ) : (
                    <span className="grid h-24 w-24 place-items-center rounded-full border-4 border-white bg-primary text-3xl font-semibold text-primary-foreground shadow-elevated">
                      {(traveler.name || traveler.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="pb-1 text-white">
                    <div className="text-xs uppercase tracking-widest opacity-80">
                      {traveler.source === "trip" ? "Sur place actuellement" : "Localisé ici"}
                    </div>
                    <div className="font-display text-2xl">{traveler.name}</div>
                    <div className="mt-1 flex items-center gap-1 text-sm opacity-90">
                      <MapPin className="h-3.5 w-3.5" />{" "}
                      {[traveler.city, traveler.country].filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm">{traveler.bio}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Sur place</div>
                  <div className="text-sm font-semibold">
                    {traveler.starts_on && traveler.ends_on
                      ? `${traveler.starts_on} → ${traveler.ends_on}`
                      : "Voyageur basé ici"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Budget</div>
                  <div className="text-sm font-semibold">
                    {traveler.budget_eur ? `${traveler.budget_eur} €` : "Non renseigné"}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Langues
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {traveler.languages.map((l) => (
                    <Badge key={l} variant="secondary" className="rounded-full">
                      {l}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Centres d'intérêt
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {traveler.interests.map((l) => (
                    <Badge key={l} className="rounded-full">
                      {l}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button asChild className="rounded-full gradient-hero text-primary-foreground">
                  <Link to="/profile/$username" params={{ username: traveler.username }}>
                    Voir le profil
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link to="/match">
                    <Sparkles className="mr-1 h-4 w-4" /> Travel Match
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
