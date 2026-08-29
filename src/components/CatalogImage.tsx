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
import {
  placeLogoQueryKey,
  resolvePlaceLogo,
  type PlaceLogoInput,
} from "@/lib/place-logo.functions";

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

const THIRD_PARTY_LOGO_HOSTS = [
  "google.com",
  "google.fr",
  "googleapis.com",
  "gstatic.com",
  "openstreetmap.org",
  "booking.com",
  "tripadvisor.com",
  "tripadvisor.fr",
  "thefork.com",
  "thefork.fr",
  "opentable.com",
  "yelp.com",
  "getyourguide.com",
  "ticketmaster.com",
  "expedia.com",
  "expedia.fr",
  "hotels.com",
  "agoda.com",
  "airbnb.com",
  "kayak.com",
  "trivago.com",
] as const;

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

function hostMatches(hostname: string, domain: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  const expected = domain.replace(/^www\./i, "").toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function safeOfficialLogoWebsite(value: unknown): string | null {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return null;
    if (THIRD_PARTY_LOGO_HOSTS.some((domain) => hostMatches(hostname, domain))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function faviconUrl(value: unknown): string | null {
  const website = safeOfficialLogoWebsite(value);
  if (!website) return null;
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(website)}&sz=256`;
}

function knownPlaceLogo(
  item: Pick<LiveCatalogItem, "tags">,
  lookup: CatalogImageLookup | null,
): { url: string; label: string } | null {
  const tags = asRecord(item.tags);
  const direct =
    safeExactHttps(tags.official_logo_url) ??
    safeExactHttps(tags.logo_url) ??
    safeExactHttps(tags.logo);
  if (direct) return { url: direct, label: "Logo officiel du lieu" };

  // A source page (Google Maps, Booking, Tripadvisor, etc.) is not the place's
  // official website. Never turn its favicon into the establishment logo.
  const website = [
    tagString(tags, "official_website"),
    lookup?.website ?? null,
    tagString(tags, "website"),
  ]
    .map((candidate) => safeOfficialLogoWebsite(candidate))
    .find((candidate): candidate is string => !!candidate);
  const favicon = faviconUrl(website);
  return favicon ? { url: favicon, label: "Logo du site officiel" } : null;
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
  const resolveLogo = useServerFn(resolvePlaceLogo);
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
  const logoInput = useMemo<PlaceLogoInput>(
    () => ({
      title: item.title,
      kind: item.kind,
      latitude: primaryInput.latitude,
      longitude: primaryInput.longitude,
      city: primaryInput.city ?? null,
      country: primaryInput.country ?? null,
      website: primaryInput.website ?? null,
    }),
    [
      item.kind,
      item.title,
      primaryInput.city,
      primaryInput.country,
      primaryInput.latitude,
      primaryInput.longitude,
      primaryInput.website,
    ],
  );
  const knownLogo = useMemo(() => knownPlaceLogo(item, lookup), [item, lookup]);
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

  const { data: resolvedLogo, isFetching: isFetchingLogo } = useQuery({
    queryKey: placeLogoQueryKey(logoInput),
    queryFn: async () => resolveLogo({ data: logoInput }),
    // Only run the extra establishment lookup for the large selected-place sheet.
    // Photos keep priority; the logo is a verified visual fallback when none exists.
    enabled: priority && primaryExhausted,
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
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

  const resolvedLogoUrl = safeExactHttps(resolvedLogo?.url);
  const logoCandidates = [
    knownLogo,
    resolvedLogoUrl ? { url: resolvedLogoUrl, label: resolvedLogo?.label ?? "Logo du site officiel" } : null,
  ].filter((entry): entry is { url: string; label: string } => !!entry && !failedUrls.has(entry.url));
  const logo = logoCandidates[0] ?? null;

  if (logo) {
    return (
      <div
        className={`${placeholderClassName ?? className} flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-secondary via-background to-secondary px-5 text-center`}
        role="img"
        aria-label={`${logo.label} pour ${item.title}`}
      >
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <img
            src={logo.url}
            alt={`Logo de ${item.title}`}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
            onError={() => setFailedUrls((current) => new Set([...current, logo.url]))}
          />
        </div>
        <span className="text-xs font-semibold text-foreground/80">{logo.label}</span>
        <span className="text-[10px] text-muted-foreground">
          Photo officielle indisponible · logo du lieu utilisé
        </span>
      </div>
    );
  }

  const placeholder = PLACEHOLDER_META[item.kind] ?? PLACEHOLDER_META.activity;
  const lookingForPhoto = isFetching || isFetchingPublic || isFetchingFallback || isFetchingLogo;
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
        {lookingForPhoto ? "Recherche d’un visuel officiel du lieu…" : "Visuel officiel indisponible"}
      </span>
      <span className="px-4 text-[10px]">
        {lookingForPhoto
          ? "Photo Google Places · site officiel · logo du lieu"
          : `${placeholder.label} · aucun logo de plateforme utilisé`}
      </span>
    </div>
  );
}
