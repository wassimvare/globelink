import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchVerifiedDestinationCovers,
  type DestinationCoverMedia,
} from "@/lib/destination-media.functions";
import { verifiedDestinationCover } from "@/lib/destination-cover";

type DestinationImageProps = {
  title: string;
  country?: string | null;
  storedUrl?: string | null;
  resolvedMedia?: DestinationCoverMedia | null;
  resolve?: boolean;
  emoji?: string;
  className?: string;
  placeholderClassName?: string;
  priority?: boolean;
  showAttribution?: boolean;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function DestinationImage({
  title,
  country,
  storedUrl,
  resolvedMedia,
  resolve = true,
  emoji = "🌍",
  className = "h-full w-full object-cover",
  placeholderClassName = "h-full w-full",
  priority = false,
  showAttribution = true,
}: DestinationImageProps) {
  const resolveCovers = useServerFn(fetchVerifiedDestinationCovers);
  const requestedTitles = useMemo(
    () =>
      Array.from(
        new Set([title, country].map((value) => String(value ?? "").trim()).filter(Boolean)),
      ),
    [country, title],
  );
  const exactStored = verifiedDestinationCover(storedUrl);
  const { data: fetchedMedia = [], isFetching } = useQuery({
    queryKey: ["destination-landmark-cover-v2", ...requestedTitles.map(normalize)],
    queryFn: () =>
      resolveCovers({ data: { titles: requestedTitles } }) as Promise<DestinationCoverMedia[]>,
    enabled: resolve && !resolvedMedia && requestedTitles.length > 0,
    staleTime: 24 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
    retry: 1,
  });
  const fetched = useMemo(() => {
    for (const requested of requestedTitles) {
      const media = fetchedMedia.find((entry) => normalize(entry.title) === normalize(requested));
      if (media) return media;
    }
    return fetchedMedia[0] ?? null;
  }, [fetchedMedia, requestedTitles]);
  const activeMedia = resolvedMedia ?? fetched;
  const candidates = useMemo(
    () =>
      Array.from(
        new Set([activeMedia?.url, exactStored].filter((value): value is string => !!value)),
      ),
    [activeMedia?.url, exactStored],
  );
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  useEffect(() => setFailedUrls(new Set()), [title, country, exactStored, activeMedia?.url]);
  const src = candidates.find((value) => !failedUrls.has(value)) ?? null;

  if (!src) {
    return (
      <div
        className={`${placeholderClassName} grid place-items-center bg-gradient-to-br from-primary/10 via-secondary to-ocean-teal/10`}
        role="img"
        aria-label={
          isFetching
            ? `Chargement du monument emblématique de ${title}`
            : `Image de ${title} indisponible`
        }
      >
        <span className="text-5xl" aria-hidden="true">
          {emoji}
        </span>
      </div>
    );
  }

  const image = (
    <img
      src={src}
      alt={activeMedia?.landmark ? `${activeMedia.landmark}, ${title}` : title}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedUrls((current) => new Set([...current, src]))}
      className={className}
    />
  );

  if (!showAttribution || !activeMedia || src !== activeMedia.url) return image;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {image}
      <a
        href={activeMedia.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-2 top-2 max-w-[85%] rounded-full bg-black/65 px-2.5 py-1 text-[9px] font-semibold text-white/90 backdrop-blur"
        title={[activeMedia.attribution, activeMedia.license].filter(Boolean).join(" · ")}
      >
        {activeMedia.landmark} · Wikimedia
      </a>
    </div>
  );
}
