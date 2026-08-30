import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MapPin,
  Search,
  Users,
  Plus,
  Compass,
  Navigation,
  Camera,
  ArrowRight,
  Map,
  UserRound,
  Flame,
  Hotel,
  Utensils,
  Sparkles,
  ExternalLink,
  Star,
  RefreshCw,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  createStoryVideoPoster,
  getSignedMediaUrl,
  getStoryVideoUploadMode,
  getVideoMetadata,
  MAX_STORY_VIDEO_DURATION_SECONDS,
  prefetchStoryMedia,
  primeStoryMediaCache,
  STORY_SEGMENT_SECONDS,
  uploadMedia,
  uploadStoryVideoChunks,
} from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { PostCard } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/Skeleton";
import { StoriesViewer, type StoryItem } from "@/components/StoriesViewer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import {
  dailyRefreshLabel,
  fetchLiveCatalog,
  catalogOfficialWebsite,
  itemLocation,
  itemPrice,
  catalogSourceLabel,
  type LiveCatalogItem,
} from "@/lib/live-catalog";
import { CatalogImage } from "@/components/CatalogImage";
import type { Database } from "@/integrations/supabase/types";
import { slugifyDestination } from "@/lib/phase2";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GlobeLink — Le fil des voyageurs" },
      {
        name: "description",
        content: "Publications, stories et conseils partagés par de vrais membres GlobeLink.",
      },
      { property: "og:title", content: "GlobeLink — Le fil des voyageurs" },
      {
        property: "og:description",
        content: "Découvre les publications de la communauté GlobeLink.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: FeedPage,
});

const PAGE_SIZE = 8;
const VIDEO_UPLOAD_RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
type FeedTab = "foryou" | "following" | "nearby";
type UserLocation = { lat: number; lng: number };

function distanceKm(a: UserLocation, b: UserLocation) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function StoriesBar({ followingIds }: { followingIds: Set<string> }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const followedIds = useMemo(() => Array.from(followingIds).sort(), [followingIds]);

  const { data: stories = [] } = useQuery({
    queryKey: ["stories", user?.id, followedIds.join(",")],
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    // PERFORMANCE_V1_HOME — le realtime invalide déjà les stories
    queryFn: async () => {
      // La fonction SQL applique elle-même la règle « ma story + stories des comptes suivis ».
      // Elle évite les courses entre le chargement des follows et celui des stories après un changement de compte.
      const { data: rpcRows, error: rpcError } = await supabase.rpc("get_visible_stories", {});

      let rows = rpcRows ?? [];
      if (rpcError) {
        // Secours pour une base qui n'aurait pas encore reçu la migration V9.5.7.
        const visibleIds = Array.from(new Set([user!.id, ...followedIds]));
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("stories")
          .select(
            "id, media_url, poster_url, media_type, media_chunks, media_mime_type, media_size_bytes, city, country, user_id, created_at, expires_at, story_group_id, segment_index, segment_count, segment_start_seconds, segment_end_seconds, video_duration_seconds",
          )
          .in("user_id", visibleIds)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(100);
        if (fallbackError) throw fallbackError;
        if (!fallbackRows?.length) return [] as StoryItem[];
        const ids = Array.from(new Set(fallbackRows.map((story) => story.user_id)));
        const { data: profiles, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", ids);
        if (profileError) throw profileError;
        const profileMap = new globalThis.Map(
          (profiles ?? []).map((profile) => [profile.id, profile]),
        );
        rows = fallbackRows.map((story) => ({
          ...story,
          username: profileMap.get(story.user_id)?.username ?? "voyageur",
          avatar_url: profileMap.get(story.user_id)?.avatar_url ?? null,
        }));
      }

      const resolved = await Promise.all(
        rows.map(
          async (story) =>
            ({
              id: story.id,
              userId: story.user_id,
              username: story.username ?? "voyageur",
              avatar: story.avatar_url ? await getSignedMediaUrl(story.avatar_url) : null,
              media:
                Array.isArray(story.media_chunks) && story.media_chunks.length > 1
                  ? null
                  : await getSignedMediaUrl(
                      Array.isArray(story.media_chunks) ? story.media_chunks[0] : story.media_url,
                    ),
              poster: story.poster_url ? await getSignedMediaUrl(story.poster_url) : null,
              mediaPath: story.media_url,
              mediaChunks: Array.isArray(story.media_chunks) ? story.media_chunks : null,
              mediaMimeType: story.media_mime_type ?? null,
              mediaSizeBytes:
                story.media_size_bytes == null ? null : Number(story.media_size_bytes),
              mediaType: story.media_type,
              city: story.city ?? story.country ?? "",
              segmentStartSeconds: Number(story.segment_start_seconds ?? 0),
              segmentEndSeconds:
                story.segment_end_seconds == null ? null : Number(story.segment_end_seconds),
              segmentIndex: Number(story.segment_index ?? 0),
              segmentCount: Number(story.segment_count ?? 1),
              storyGroupId: story.story_group_id ?? null,
            }) satisfies StoryItem,
        ),
      );

      // On conserve la bulle même si un média rencontre un problème temporaire :
      // le viewer affiche alors une erreur claire au lieu de faire disparaître la story.
      return resolved;
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`stories-feed-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        void qc.invalidateQueries({ queryKey: ["stories"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  async function onFile(file: File | null) {
    if (!file) return;
    if (!user) return toast.info("Crée un compte pour publier une story.");

    const uploadedPaths: string[] = [];
    let progressToastId: ReturnType<typeof toast.loading> | undefined;
    try {
      setUploading(true);
      const isVideo = file.type.startsWith("video/");
      const groupId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const rows: Database["public"]["Tables"]["stories"]["Insert"][] = [];
      let publishedSegments = 1;

      const uploadPoster = async (posterFile: File | null | undefined) => {
        if (!posterFile) return null;
        const path = await uploadMedia(user.id, "stories", posterFile, {
          maxBytes: 4 * 1024 * 1024,
        });
        uploadedPaths.push(path);
        return path;
      };

      if (isVideo) {
        progressToastId = toast.loading("Analyse de la vidéo…");
        const metadata = await getVideoMetadata(file, MAX_STORY_VIDEO_DURATION_SECONDS);
        const logicalSegmentCount = Math.max(
          1,
          Math.ceil(metadata.durationSeconds / STORY_SEGMENT_SECONDS),
        );
        publishedSegments = logicalSegmentCount;

        const posterPromise = createStoryVideoPoster(file, 0);

        const uploadPosterSafely = async (posterFile: File | null | undefined) => {
          try {
            return await uploadPoster(posterFile);
          } catch {
            return null;
          }
        };

        const addLogicalVideoRows = ({
          mediaPath,
          posterPath,
          mediaChunks,
          mediaMimeType,
          mediaSizeBytes,
        }: {
          mediaPath: string;
          posterPath: string | null;
          mediaChunks: string[] | null;
          mediaMimeType: string;
          mediaSizeBytes: number;
        }) => {
          for (let segmentIndex = 0; segmentIndex < logicalSegmentCount; segmentIndex += 1) {
            rows.push({
              user_id: user.id,
              media_url: mediaPath,
              poster_url: posterPath,
              media_chunks: mediaChunks,
              media_mime_type: mediaMimeType,
              media_size_bytes: mediaSizeBytes,
              media_type: "video",
              created_at: createdAt,
              expires_at: expiresAt,
              story_group_id: groupId,
              segment_index: segmentIndex,
              segment_count: logicalSegmentCount,
              segment_start_seconds: segmentIndex * STORY_SEGMENT_SECONDS,
              segment_end_seconds: Math.min(
                metadata.durationSeconds,
                (segmentIndex + 1) * STORY_SEGMENT_SECONDS,
              ),
              video_duration_seconds: metadata.durationSeconds,
            });
          }
        };

        if (getStoryVideoUploadMode(file.size) === "direct") {
          toast.loading("Envoi de la vidéo… 0 %", { id: progressToastId });
          const mediaPath = await uploadMedia(user.id, "stories", file, {
            maxBytes: null,
            maxVideoDurationSeconds: MAX_STORY_VIDEO_DURATION_SECONDS,
            verifiedVideoMetadata: metadata,
            forceResumable: file.size > VIDEO_UPLOAD_RESUMABLE_THRESHOLD,
            onProgress: (progress) => {
              toast.loading(`Envoi de la vidéo… ${Math.min(95, Math.round(progress * 95))} %`, {
                id: progressToastId,
              });
            },
          });
          uploadedPaths.push(mediaPath);
          toast.loading("Finalisation de la story…", { id: progressToastId });
          const posterPath = await uploadPosterSafely(await posterPromise);
          primeStoryMediaCache(mediaPath, null, file.type, file);
          addLogicalVideoRows({
            mediaPath,
            posterPath,
            mediaChunks: null,
            mediaMimeType: file.type,
            mediaSizeBytes: file.size,
          });
        } else {
          toast.loading("Envoi compatible iPhone… 0 %", { id: progressToastId });
          const upload = await uploadStoryVideoChunks(user.id, file, (progress) => {
            toast.loading(`Envoi compatible iPhone… ${Math.min(95, Math.round(progress * 95))} %`, {
              id: progressToastId,
            });
          });
          uploadedPaths.push(...upload.paths);
          toast.loading("Finalisation de la story…", { id: progressToastId });
          const posterPath = await uploadPosterSafely(await posterPromise);
          primeStoryMediaCache(upload.paths[0], upload.paths, upload.mimeType, file);
          addLogicalVideoRows({
            mediaPath: upload.paths[0],
            posterPath,
            mediaChunks: upload.paths,
            mediaMimeType: upload.mimeType,
            mediaSizeBytes: upload.totalBytes,
          });
        }
      } else {
        progressToastId = toast.loading("Envoi de la story…");
        const path = await uploadMedia(user.id, "stories", file, { maxBytes: null });
        uploadedPaths.push(path);
        rows.push({
          user_id: user.id,
          media_url: path,
          poster_url: null,
          media_chunks: null,
          media_mime_type: file.type,
          media_size_bytes: file.size,
          media_type: "image",
          created_at: createdAt,
          expires_at: expiresAt,
          story_group_id: groupId,
          segment_index: 0,
          segment_count: 1,
          segment_start_seconds: 0,
          segment_end_seconds: null,
          video_duration_seconds: null,
        });
      }

      const { error } = await supabase.from("stories").insert(rows);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["stories"] });
      toast.success(
        publishedSegments > 1
          ? `Vidéo publiée en ${publishedSegments} stories rapides de 30 secondes`
          : "Story publiée pendant 24 h",
      );
    } catch (error) {
      if (uploadedPaths.length)
        await supabase.storage
          .from("media")
          .remove(uploadedPaths)
          .catch(() => undefined);
      const message = error instanceof Error ? error.message : "Publication impossible";
      toast.error(message || "Publication impossible", { duration: 12_000 });
    } finally {
      if (progressToastId !== undefined) toast.dismiss(progressToastId);
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const bubbles = useMemo(() => {
    const seen = new Set<string>();
    return stories.filter((story) => {
      const key = story.userId ?? story.username;
      if (seen.has(key)) return false;
      seen.add(key);
      return !!story.media || !!story.mediaChunks?.length;
    });
  }, [stories]);

  return (
    <>
      <div className="stories-strip -mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-1">
        <button
          type="button"
          onClick={() =>
            user ? fileInput.current?.click() : toast.info("Crée un compte pour publier une story.")
          }
          disabled={uploading}
          className="flex w-18 shrink-0 flex-col items-center gap-1.5"
        >
          <div className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-primary/50 bg-card">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <span className="max-w-full truncate text-[11px] font-medium">
            {uploading ? "Envoi…" : "Ta story"}
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          hidden
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        {!user && (
          <div className="flex min-w-[220px] items-center rounded-2xl bg-secondary/60 px-4 text-xs leading-relaxed text-muted-foreground">
            Connecte-toi pour publier et voir les stories des personnes suivies.
          </div>
        )}
        {user && bubbles.length === 0 && (
          <div className="flex min-w-[220px] items-center rounded-2xl bg-secondary/60 px-4 text-xs leading-relaxed text-muted-foreground">
            Suis des voyageurs pour voir leurs stories ici.
          </div>
        )}
        {bubbles.map((story) => (
          <button
            key={story.id}
            type="button"
            onPointerEnter={() =>
              void prefetchStoryMedia(
                story.mediaPath,
                story.mediaChunks,
                story.mediaMimeType,
                story.mediaType,
              ).catch(() => undefined)
            }
            onTouchStart={() =>
              void prefetchStoryMedia(
                story.mediaPath,
                story.mediaChunks,
                story.mediaMimeType,
                story.mediaType,
              ).catch(() => undefined)
            }
            onClick={() =>
              setViewerIdx(
                Math.max(
                  0,
                  stories.findIndex((item) => item.userId === story.userId),
                ),
              )
            }
            className="flex w-18 shrink-0 flex-col items-center gap-1.5"
          >
            <div className="rounded-full border-2 border-primary p-0.5">
              <div className="h-14 w-14 overflow-hidden rounded-full bg-muted">
                {story.avatar ? (
                  <img src={story.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center font-semibold">
                    {story.username[0]?.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground">
              @{story.username}
            </span>
          </button>
        ))}
      </div>
      {viewerIdx !== null && (
        <StoriesViewer
          stories={stories}
          startIndex={viewerIdx}
          onClose={() => setViewerIdx(null)}
        />
      )}
    </>
  );
}

function FeedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [loadSecondaryContent, setLoadSecondaryContent] = useState(false);
  const secondaryContentRef = useRef<HTMLDivElement | null>(null);
  // HOME_SIMPLIFIED_V1

  const { data: followRows = [] } = useQuery({
    queryKey: ["my-follows", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const followingIds = useMemo(
    () => new Set(followRows.map((row) => row.following_id)),
    [followRows],
  );

  const { data: homeProfile } = useQuery({
    queryKey: ["phase2-home-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,username,city,country,interests,travel_style")
        .eq("id", user!.id)
        .maybeSingle();
      return data ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const { data: nextTrip } = useQuery({
    // The home card must use the same persisted trips as the Carnet.
    // The `trips` prefix also lets Carnet create/delete invalidations refresh it immediately.
    queryKey: ["trips", user?.id, "home-next"],
    enabled: !!user,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("trips")
        .select("id,title,country,city,starts_on,ends_on")
        .eq("user_id", user!.id)
        .is("finalized_at", null)
        .gte("ends_on", today)
        .order("starts_on", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (tab !== "nearby" || userLocation || locationDenied || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setLocationDenied(true),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
    );
  }, [tab, userLocation, locationDenied]);

  const feed = useInfiniteQuery({
    queryKey: [
      "feed",
      tab,
      user?.id,
      Array.from(followingIds).join(","),
      userLocation?.lat,
      userLocation?.lng,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (tab === "following" && (!user || followingIds.size === 0)) return [];
      const from = Number(pageParam) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let request = supabase
        .from("posts")
        .select(
          "*, profiles(username, display_name, avatar_url), post_likes(user_id), comments(count), post_media(id, url, media_type, position, media_chunks, media_mime_type, media_size_bytes)",
        )
        .order("created_at", { ascending: false });
      if (tab === "following") request = request.in("user_id", Array.from(followingIds));
      if (tab === "nearby")
        request = request.not("lat", "is", null).not("lng", "is", null).limit(80);
      else request = request.range(from, to);
      const { data, error } = await request;
      if (error) throw error;
      if (tab !== "nearby" || !userLocation) return data ?? [];
      return (data ?? [])
        .map((post: any) => ({
          ...post,
          distance_km: distanceKm(userLocation, { lat: post.lat, lng: post.lng }),
        }))
        .filter((post: any) => post.distance_km <= 100)
        .sort((a: any, b: any) => a.distance_km - b.distance_km)
        .slice(0, PAGE_SIZE);
    },
    getNextPageParam: (lastPage, pages) =>
      tab === "nearby" || lastPage.length < PAGE_SIZE ? undefined : pages.length,
  });

  const posts = feed.data?.pages.flat() ?? [];
  const sentinel = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "500px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (loadSecondaryContent || !secondaryContentRef.current) return;
    const node = secondaryContentRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setLoadSecondaryContent(true);
        observer.disconnect();
      },
      { rootMargin: "700px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadSecondaryContent]);

  const { data: internetDiscoveries = [], isLoading: discoveriesLoading } = useQuery({
    queryKey: ["live-catalog", "homepage-popular"],
    enabled: loadSecondaryContent,
    queryFn: () => fetchLiveCatalog({ kinds: ["activity"], limit: 24 }),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const { data: internetDeals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ["live-catalog", "homepage-deals"],
    enabled: loadSecondaryContent,
    queryFn: () => fetchLiveCatalog({ kinds: ["deal"], limit: 12 }),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const discoveryGroups = useMemo(
    () => ({
      activity: selectCountryDiverseCatalogCards(
        internetDiscoveries.filter((item) => item.kind === "activity"),
        8,
      ),
      restaurant: selectCatalogCards(
        internetDiscoveries.filter((item) => item.kind === "restaurant"),
        8,
      ),
      hotel: selectCatalogCards(
        internetDiscoveries.filter((item) => item.kind === "hotel"),
        8,
      ),
    }),
    [internetDiscoveries],
  );
  const offerItems = useMemo(() => {
    if (internetDeals.length) return selectCatalogCards(internetDeals, 6);
    // Real fallback only: never invent a discount or a price. These cards link
    // to the venue/source and clearly say that availability must be checked.
    return selectCatalogCards(
      internetDiscoveries.filter((item) => !!item.booking_url || !!item.source_url),
      6,
    ).map((item) => ({ ...item, price_text: item.price_text || "Voir la source" }));
  }, [internetDeals, internetDiscoveries]);

  const runSearch = () => {
    const value = query.trim();
    if (value) navigate({ to: "/search", search: { q: value } });
  };
  const tabs: Array<{ key: FeedTab; label: string; icon: typeof Compass }> = [
    { key: "foryou", label: "Récent", icon: Compass },
    { key: "following", label: "Suivis", icon: Users },
    { key: "nearby", label: "Près de toi", icon: Navigation },
  ];

  return (
    <div className="app-page">
      <AppHeader />
      <main>
        <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="stories-card surface-card px-3 py-3">
            <StoriesBar followingIds={followingIds} />
          </div>
        </section>


        {user && (
          <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-4">
            <div className="phase2-trip-card overflow-hidden rounded-[1.7rem] bg-gradient-to-r from-primary via-ocean-mid to-ocean-teal p-[1px] shadow-soft">
              <div className="flex flex-col gap-4 rounded-[calc(1.7rem-1px)] bg-card/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Ton espace Voyage
                    </p>
                    {nextTrip ? (
                      <>
                        <h2 className="truncate font-display text-xl font-semibold">
                          Prochain voyage ·{" "}
                          {[nextTrip.city, nextTrip.country]
                            .filter(Boolean)
                            .join(", ")}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(`${nextTrip.starts_on}T12:00:00`).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          →{" "}
                          {new Date(`${nextTrip.ends_on}T12:00:00`).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                          {nextTrip.title ? ` · ${nextTrip.title}` : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="truncate font-display text-xl font-semibold">
                          {homeProfile?.display_name
                            ? `${homeProfile.display_name}, prépare ton prochain voyage`
                            : "Prépare ton prochain voyage"}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {homeProfile?.interests?.length
                            ? `Selon tes envies : ${homeProfile.interests.slice(0, 4).join(" · ")}`
                            : "Ajoute une destination et tes centres d’intérêt pour personnaliser le Fil, la carte et Travel Match."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/trips"
                    className="inline-flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    {nextTrip ? "Ouvrir Voyage" : "Créer mon voyage"}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                  {nextTrip ? (
                    <Link
                      to="/destinations/$slug"
                      params={{ slug: slugifyDestination(nextTrip.country) }}
                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"
                    >
                      Explorer la destination <MapPin className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      to="/intelligence"
                      className="inline-flex h-10 items-center gap-1 rounded-xl bg-secondary px-3 text-xs font-semibold"
                    >
                      Préparer avec l’IA <Sparkles className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                <Compass className="h-4 w-4" /> Communauté
              </div>
              <h1 className="mt-1 font-display text-3xl font-semibold">Fil d'actualité</h1>
            </div>
          </div>
          <div className="feed-tabs sticky top-16 z-20 -mx-3 mb-5 border-b border-border/60 bg-background/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
            <div className="grid grid-cols-3 gap-1 py-1.5">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`relative rounded-xl px-2 py-2.5 text-xs font-semibold sm:text-sm ${tab === key ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {tab === "following" && !user && (
            <AccountNotice text="Connecte-toi pour voir uniquement les publications des voyageurs suivis." />
          )}
          {tab === "following" && user && followingIds.size === 0 && (
            <EmptyState text="Tu ne suis encore personne. Découvre les membres ci-dessous." />
          )}
          {tab === "nearby" && !userLocation && !locationDenied && (
            <EmptyState text="Autorise la localisation pour afficher les publications à moins de 100 km." />
          )}
          {tab === "nearby" && locationDenied && (
            <EmptyState text="Localisation refusée. Active-la dans les réglages du navigateur pour utiliser ce filtre." />
          )}

          {feed.isLoading ? (
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <PostCardSkeleton key={index} />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyState text="Aucune publication réelle à afficher pour le moment." />
          ) : (
            <div className="feed-list space-y-5">
              {posts.map((post: any) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          <div ref={sentinel} className="h-8" />
          {feed.isFetchingNextPage && <PostCardSkeleton />}
        </section>

        <div ref={secondaryContentRef} className="h-px" aria-hidden="true" />
        {loadSecondaryContent && (
          <section className="catalog-after-feed border-y border-border/60 bg-card/25 py-8 sm:py-12">
          <div className="mx-auto max-w-6xl space-y-10 px-3 sm:px-4">
            <CatalogSection
              title="Sélection du moment"
              subtitle={`Lieux et activités réels sélectionnés aujourd’hui · ${dailyRefreshLabel()}`}
              icon={<Flame className="h-4 w-4" />}
              items={offerItems}
              loading={dealsLoading || discoveriesLoading}
              kind="deal"
              cta={{ label: "Voir la sélection", to: "/deals" }}
            />
            <CatalogSection
              title="Activités populaires"
              subtitle="Attractions et activités vérifiées par Google Places · événements vérifiés par Ticketmaster"
              icon={<Sparkles className="h-4 w-4" />}
              items={discoveryGroups.activity}
              loading={discoveriesLoading}
              kind="activity"
              cta={{ label: "Tous les pays", to: "/activities" }}
            />
          </div>
        </section>

        )}
      </main>
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        GlobeLink — Des membres réels, des voyages partagés.
      </footer>
    </div>
  );
}

function catalogScore(item: LiveCatalogItem) {
  const tags =
    item.tags && typeof item.tags === "object" ? (item.tags as Record<string, unknown>) : {};
  const media = item.image_url || tags.image || tags.wikimedia_commons || tags.wikidata ? 45 : 0;
  const officialLink = item.booking_url ? 25 : 0;
  const reviewScore = Math.min(200, Math.max(0, item.reviews_count || 0));
  const ratingScore = item.rating == null ? 0 : Math.max(0, item.rating) * 30;
  let hash = 0;
  const dailyKey = `${item.id}:${Math.floor(Date.now() / 86_400_000)}`;
  for (let index = 0; index < dailyKey.length; index += 1)
    hash = (hash * 31 + dailyKey.charCodeAt(index)) | 0;
  return ratingScore + reviewScore + media + officialLink + Math.abs(hash % 25);
}

function rankCatalog(items: LiveCatalogItem[]) {
  return [...items].sort((a, b) => catalogScore(b) - catalogScore(a));
}

function normalizedCatalogText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function catalogPhysicalKey(item: LiveCatalogItem) {
  const title = normalizedCatalogText(item.title);
  if (item.latitude != null && item.longitude != null) {
    return `${item.kind}:${title}:${item.latitude.toFixed(4)}:${item.longitude.toFixed(4)}`;
  }
  const location = `${normalizedCatalogText(item.city)}:${normalizedCatalogText(item.country)}`;
  const source =
    item.source_url?.trim().toLocaleLowerCase("fr") || `${item.provider}:${item.external_id}`;
  return `${item.kind}:${title}:${location}:${source}`;
}

function catalogDirectImageKey(item: LiveCatalogItem) {
  const tags =
    item.tags && typeof item.tags === "object" ? (item.tags as Record<string, unknown>) : {};
  const value = item.image_url ?? tags.image ?? tags.wikimedia_commons ?? tags.commons;
  return typeof value === "string" && value.trim() ? value.trim().toLocaleLowerCase("fr") : null;
}

function selectCatalogCards(items: LiveCatalogItem[], limit: number) {
  const physicalKeys = new Set<string>();
  const imageKeys = new Set<string>();
  const selected: LiveCatalogItem[] = [];

  for (const item of rankCatalog(items)) {
    const physicalKey = catalogPhysicalKey(item);
    if (physicalKeys.has(physicalKey)) continue;

    const imageKey = catalogDirectImageKey(item);
    // Une mauvaise source peut attribuer exactement la même photo à plusieurs lieux.
    // On garde alors la fiche la mieux classée et on évite l'effet de doublon visuel.
    if (imageKey && imageKeys.has(imageKey)) continue;

    physicalKeys.add(physicalKey);
    if (imageKey) imageKeys.add(imageKey);
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function selectCountryDiverseCatalogCards(items: LiveCatalogItem[], limit: number) {
  const ranked = selectCatalogCards(items, Math.max(items.length, limit));
  const selected: LiveCatalogItem[] = [];
  const countries = new Set<string>();

  for (const item of ranked) {
    const country = normalizedCatalogText(item.country);
    if (!country || countries.has(country)) continue;
    countries.add(country);
    selected.push(item);
    if (selected.length >= limit) return selected;
  }
  for (const item of ranked) {
    if (selected.some((candidate) => candidate.id === item.id)) continue;
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function CatalogSection({
  title,
  subtitle,
  icon,
  items,
  loading,
  kind,
  cta,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: LiveCatalogItem[];
  loading: boolean;
  kind: LiveCatalogItem["kind"];
  cta?: { label: string; to: "/map" | "/deals" | "/activities" };
}) {
  return (
    <div className="catalog-section">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            {icon} Sélection réelle
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold leading-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {subtitle}
          </p>
        </div>
        {cta && (
          <Link
            to={cta.to}
            className="hidden min-h-10 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-primary sm:inline-flex"
          >
            {cta.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="catalog-card-strip">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="catalog-card-skeleton" />
          ))}
        </div>
      ) : items.length ? (
        <div className="catalog-card-strip">
          {items.map((item, index) => (
            <CatalogCard
              key={`${item.provider}:${item.external_id}`}
              item={item}
              offerMode={kind === "deal"}
              priority={index === 0}
              fallbackIndex={index}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-background/60 p-6 text-center text-sm text-muted-foreground">
          La collecte n’a pas encore trouvé de résultat pour cette rubrique. Elle réessaiera
          automatiquement.
        </div>
      )}
      {cta && (
        <Link
          to={cta.to}
          className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-primary sm:hidden"
        >
          {cta.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function CatalogCard({
  item,
  offerMode,
  priority,
  fallbackIndex,
}: {
  item: LiveCatalogItem;
  offerMode: boolean;
  priority: boolean;
  fallbackIndex: number;
}) {
  const actualDeal = item.kind === "deal";
  const destination = actualDeal ? ("/deals/$slug" as const) : ("/activities/$slug" as const);
  return (
    <Link to={destination} params={{ slug: item.slug }} className="catalog-home-card group">
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary sm:aspect-[3/4]">
        <CatalogImage
          item={item}
          priority={priority}
          fallbackIndex={fallbackIndex}
          lookup={{
            latitude: item.latitude,
            longitude: item.longitude,
            city: item.city,
            country: item.country,
            website: catalogOfficialWebsite(item),
          }}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <span className="absolute right-2 top-2 max-w-[75%] truncate rounded-full bg-black/55 px-2 py-1 text-[9px] font-medium text-white backdrop-blur-sm">
          {catalogSourceLabel(item)}
        </span>
        {offerMode && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground shadow-soft">
            {actualDeal ? item.category || "Offre" : "Source vérifiable"}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-4">
          <h3 className="line-clamp-2 font-display text-lg font-semibold leading-tight">
            {item.title}
          </h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-white/80">
            <MapPin className="h-3 w-3 shrink-0" />
            {itemLocation(item) || "En ligne"}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            {offerMode ? (
              <span className="font-semibold text-white">{itemPrice(item)}</span>
            ) : item.rating != null ? (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                {Number(item.rating).toFixed(1)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-white/75">
                <RefreshCw className="h-3 w-3" /> Actualisé
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold">
              Voir <ExternalLink className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function AccountNotice({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center text-sm text-muted-foreground">
      {text}{" "}
      <Link to="/auth" className="font-semibold text-primary underline">
        Créer un compte
      </Link>
    </div>
  );
}
