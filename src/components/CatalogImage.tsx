import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LiveCatalogItem } from "@/lib/live-catalog";
import { trustedDirectCatalogImage } from "@/lib/catalog-reliability";
import {
  resolveVerifiedPlaceMedia,
  verifiedPlaceMediaQueryKey,
  type PlaceMediaInput,
} from "@/lib/place-media.functions";
import {
  publicPlaceMediaQueryKey,
  resolvePublicPlaceMedia,
} from "@/lib/public-place-media.functions";

type CatalogImageLookup = {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  website?: string | null;
};

type CatalogImageProps = {
  item: Pick<LiveCatalogItem, "id" | "kind" | "title" | "image_url" | "tags">;
  className?: string;
  placeholderClassName?: string;
  priority?: boolean;
  showIllustrationBadge?: boolean;
  fallbackIndex?: number;
  lookup?: CatalogImageLookup | null;
  showAttribution?: boolean;
};

const PLACEHOLDER_META: Record<LiveCatalogItem["kind"], { emoji: string; label: string }> = {
  activity: { emoji: "🎯", label: "Activité" },
  restaurant: { emoji: "🍽️", label: "Restaurant" },
  hotel: { emoji: "🏨", label: "Hôtel" },
  deal: { emoji: "🔥", label: "Offre" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeExactHttps(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    // Older GlobeLink builds used generic Unsplash pictures. Never present
    // those illustrations as photos of a named place.
    if (/^(images\.)?unsplash\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function directImage(
  item: Pick<LiveCatalogItem, "kind" | "title" | "image_url" | "tags"> &
    Partial<Pick<LiveCatalogItem, "provider" | "source_url">>,
): string | null {
  const tags = asRecord(item.tags);
  return (
    trustedDirectCatalogImage(item, item.image_url) ??
    trustedDirectCatalogImage(item, tags.official_image_url) ??
    trustedDirectCatalogImage(item, tags.provider_image_url)
  );
}

function tagString(tags: Record<string, unknown>, key: string) {
  const value = tags[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function catalogPlaceMediaInput(
  item: Pick<LiveCatalogItem, "kind" | "title" | "tags">,
  lookup: CatalogImageLookup | null,
  options?: { skipGoogle?: boolean; skipOfficialSite?: boolean },
): PlaceMediaInput {
  const tags = asRecord(item.tags);
  return {
    title: item.title,
    kind: item.kind,
    latitude: lookup?.latitude ?? null,
    longitude: lookup?.longitude ?? null,
    city: lookup?.city ?? null,
    country: lookup?.country ?? null,
    website:
      tagString(tags, "official_website") ?? lookup?.website ?? tagString(tags, "website") ?? null,
    googlePhotoName: tagString(tags, "google_photo_name"),
    googlePhotoAttributions: Array.isArray(tags.google_photo_attributions)
      ? tags.google_photo_attributions
          .map((entry) => {
            const value = asRecord(entry);
            return {
              displayName: typeof value.displayName === "string" ? value.displayName : null,
              uri: typeof value.uri === "string" ? value.uri : null,
            };
          })
          .filter((entry) => !!entry.displayName)
      : [],
    address: lookup?.address ?? tagString(tags, "address") ?? null,
    wikidata: tagString(tags, "wikidata"),
    wikipedia: tagString(tags, "wikipedia"),
    wikimediaCommons: tagString(tags, "wikimedia_commons") ?? tagString(tags, "commons"),
    skipGoogle: options?.skipGoogle === true,
    skipOfficialSite: options?.skipOfficialSite === true,
  };
}

export function CatalogImage({
  item,
  className = "h-full w-full object-cover",
  placeholderClassName,
  priority = false,
  lookup = null,
  showAttribution = false,
}: CatalogImageProps) {
  const exactDirect = useMemo(() => directImage(item), [item]);
  const resolveMedia = useServerFn(resolveVerifiedPlaceMedia);
  const resolvePublicMedia = useServerFn(resolvePublicPlaceMedia);
  const primaryInput = useMemo(
    () => catalogPlaceMediaInput(item, lookup, { skipGoogle: false, skipOfficialSite: false }),
    [item, lookup],
  );
  const fallbackInput = useMemo(
    () => catalogPlaceMediaInput(item, lookup, { skipGoogle: true, skipOfficialSite: true }),
    [item, lookup],
  );
  const publicInput = useMemo(
    () => ({
      title: item.title,
      kind: item.kind,
      latitude: primaryInput.latitude,
      longitude: primaryInput.longitude,
      city: primaryInput.city ?? null,
      country: primaryInput.country ?? null,
    }),
    [item.kind, item.title, primaryInput.city, primaryInput.country, primaryInput.latitude, primaryInput.longitude],
  );
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  useEffect(() => setFailedUrls(new Set()), [item.id]);

  const directFailed = !!exactDirect && failedUrls.has(exactDirect);
  const canResolveSource =
    (!exactDirect || directFailed) &&
    (!!lookup ||
      !!primaryInput.wikidata ||
      !!primaryInput.wikipedia ||
      !!primaryInput.wikimediaCommons);
  const {
    data: resolvedMedia,
    isFetching,
    refetch: refetchPrimary,
  } = useQuery({
    queryKey: verifiedPlaceMediaQueryKey(item.id, primaryInput, "primary"),
    queryFn: async () => resolveMedia({ data: primaryInput }),
    enabled: canResolveSource,
    // Google Places photo URIs are temporary. A short freshness window keeps
    // prefetched photos instant without pinning an expired URI for many minutes.
    staleTime: 30_000,
    gcTime: 15 * 60_000,
    retry: 1,
  });

  const primaryUrl = safeExactHttps(resolvedMedia?.url);
  const primaryFailed = !!primaryUrl && failedUrls.has(primaryUrl);
  const primaryExhausted = canResolveSource && !isFetching && (!primaryUrl || primaryFailed);
  const { data: publicMedia, isFetching: isFetchingPublic } = useQuery({
    queryKey: publicPlaceMediaQueryKey(publicInput),
    queryFn: async () => resolvePublicMedia({ data: publicInput }),
    // The selected place sheet passes priority=true. Run the stronger keyless
    // Nominatim -> official-site lookup there, rather than hammering Nominatim for
    // every small card that happens to be visible on the map.
    enabled: primaryExhausted && priority,
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });

  const publicUrl = safeExactHttps(publicMedia?.url);
  const publicFailed = !!publicUrl && failedUrls.has(publicUrl);
  const { data: fallbackMedia, isFetching: isFetchingFallback } = useQuery({
    queryKey: verifiedPlaceMediaQueryKey(item.id, fallbackInput, "fallback"),
    queryFn: async () => resolveMedia({ data: fallbackInput }),
    enabled: canResolveSource && (primaryFailed || publicFailed),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });

  const directAvailable = exactDirect && !failedUrls.has(exactDirect) ? exactDirect : null;
  const resolvedCandidate = safeExactHttps(resolvedMedia?.url);
  const publicCandidate = safeExactHttps(publicMedia?.url);
  const fallbackCandidate = safeExactHttps(fallbackMedia?.url);
  const resolvedUrl =
    directAvailable ??
    (resolvedCandidate && !failedUrls.has(resolvedCandidate) ? resolvedCandidate : null) ??
    (publicCandidate && !failedUrls.has(publicCandidate) ? publicCandidate : null) ??
    (fallbackCandidate && !failedUrls.has(fallbackCandidate) ? fallbackCandidate : null);
  const activeMedia =
    resolvedUrl && fallbackCandidate === resolvedUrl
      ? fallbackMedia
      : resolvedUrl && publicCandidate === resolvedUrl
        ? publicMedia
        : resolvedUrl && resolvedCandidate === resolvedUrl
          ? resolvedMedia
          : null;

  if (resolvedUrl) {
    const image = (
      <img
        src={resolvedUrl}
        alt={item.title}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        referrerPolicy="no-referrer"
        className={className}
        onError={() => {
          setFailedUrls((current) => new Set([...current, resolvedUrl]));
          // A prefetched Google photo URI may expire. Ask the server for a fresh
          // Places media URI instead of permanently skipping Google after one failure.
          if (activeMedia?.source === "google-places") {
            void refetchPrimary();
          }
        }}
      />
    );
    const attributions = activeMedia?.attributions ?? [];
    if (!showAttribution || !attributions.length) return image;
    return (
      <div className="relative w-full overflow-hidden bg-secondary">
        {image}
        <div className="absolute bottom-1.5 right-1.5 max-w-[85%] rounded-md bg-black/65 px-2 py-1 text-[9px] leading-tight text-white backdrop-blur-sm">
          Photo ·{" "}
          {attributions.slice(0, 2).map((entry, index) => (
            <span key={`${entry.label}-${index}`}>
              {index > 0 ? " · " : ""}
              {entry.url ? (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  {entry.label}
                </a>
              ) : (
                entry.label
              )}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const placeholder = PLACEHOLDER_META[item.kind] ?? PLACEHOLDER_META.activity;
  const lookingForPhoto = isFetching || isFetchingPublic || isFetchingFallback;
  return (
    <div
      className={`${placeholderClassName ?? className} flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-secondary via-background to-secondary text-center text-muted-foreground`}
      role="img"
      aria-label={`Aucune photo vérifiée disponible pour ${item.title}`}
    >
      <span className="text-4xl" aria-hidden="true">
        {placeholder.emoji}
      </span>
      <span className="px-4 text-xs font-semibold text-foreground/75">
        {lookingForPhoto ? "Recherche de la photo officielle du lieu…" : "Aucune photo officielle vérifiée"}
      </span>
      <span className="px-4 text-[10px]">
        {lookingForPhoto
          ? "Google Places · OpenStreetMap · site officiel"
          : `${placeholder.label} · aucune image générique utilisée`}
      </span>
    </div>
  );
}
