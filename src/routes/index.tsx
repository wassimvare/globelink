import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin, MessageCircle, Search, Sparkles, Star, TrendingUp, Users, Zap, ArrowRight, Flame, Plus, Compass, Globe2, Navigation, Crown, Radar, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getSignedMediaUrl, uploadMedia } from "@/lib/storage";

import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { PostCard } from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/Skeleton";
import { CountrySheet } from "@/components/CountrySheet";
import { StoriesViewer, type StoryItem } from "@/components/StoriesViewer";
import { COUNTRIES } from "@/lib/countries";
import { COUNTRY_BY_NAME } from "@/lib/country-info";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { MOCK_POSTS, rankMockPosts, type FeedTab, type MockPost } from "@/lib/mock-feed";
import {
  TRENDING_DESTINATIONS,
  NEARBY_TRAVELERS, POPULAR_ACTIVITIES, COMMUNITY_QUESTIONS,
} from "@/lib/mock-home";
import { dealsOfTheDay, dealsRefreshLabel } from "@/lib/deals";
import { dailyRefreshLabel, dailyRotation, useDailyContentKey } from "@/lib/daily-content";
import { getDailyDiscovery } from "@/lib/daily-discovery.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GlobeLink — Le fil des voyageurs" },
      { name: "description", content: "Fil d'inspiration voyage : stories, destinations tendances, bons plans et publications de la communauté GlobeLink." },
      { property: "og:title", content: "GlobeLink — Le fil des voyageurs" },
      { property: "og:description", content: "Stories, destinations tendances, bons plans et publications de la communauté GlobeLink." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FeedPage,
});

const PAGE_SIZE = 8;

function SectionHeader({ icon: Icon, title, subtitle, cta }: { icon: any; title: string; subtitle?: string; cta?: { label: string; to: string } }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
          <Icon className="h-4 w-4" /> {subtitle}
        </div>
        <h2 className="mt-1 font-display text-2xl sm:text-3xl">{title}</h2>
      </div>
      {cta && (
        <Link to={cta.to} className="hidden shrink-0 items-center gap-1 text-sm font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex">
          {cta.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function StoriesBar({ followingIds }: { followingIds: Set<string> }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  const followedIds = useMemo(() => Array.from(followingIds).sort(), [followingIds]);

  const { data: stories } = useQuery({
    queryKey: ["stories", user?.id, followedIds.join(",")],
    queryFn: async () => {
      if (!user) return [];
      const visibleIds = Array.from(new Set([user.id, ...followedIds]));
      const { data: rows, error } = await supabase
        .from("stories")
        .select("id, media_url, media_type, city, country, user_id")
        .in("user_id", visibleIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const ids = Array.from(new Set(list.map((s) => s.user_id)));
      const { data: profs } = await supabase
        .from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      // resolve signed URL for each story media
      return await Promise.all(list.map(async (s) => {
        const p = map.get(s.user_id);
        const signed = await getSignedMediaUrl(s.media_url);
        return {
          id: s.id,
          userId: s.user_id,
          username: p?.username ?? "voyageur",
          avatar: p?.avatar_url ? await getSignedMediaUrl(p.avatar_url) : null,
          media: signed,
          mediaType: s.media_type,
          city: s.city ?? s.country ?? "",
        };
      }));
    },
    enabled: !!user,
  });

  async function onFile(f: File | null) {
    if (!f) return;
    if (!user) { toast.error("Connecte-toi pour publier une story"); return; }
    try {
      setUploading(true);
      const path = await uploadMedia(user.id, "stories", f);
      const { error } = await supabase.from("stories").insert({
        user_id: user.id,
        media_url: path,
        media_type: f.type.startsWith("video/") ? "video" : "image",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      toast.success("Story publiée ✨");
      qc.invalidateQueries({ queryKey: ["stories"] });
    } catch (e: any) {
      toast.error(e.message ?? "Publication impossible");
    } finally {
      setUploading(false);
    }
  }

  // Only real stories from followed profiles; show one bubble per user, latest story first.
  const all = useMemo<StoryItem[]>(() => (stories ?? []).filter((s) => !!s.media), [stories]);
  const storyBubbles = useMemo(() => {
    const seenUsers = new Set<string>();
    return all.filter((story) => {
      const key = story.userId ?? story.username;
      if (seenUsers.has(key)) return false;
      seenUsers.add(key);
      return true;
    });
  }, [all]);

  useEffect(() => {
    all.slice(0, 4).forEach((story) => {
      if (!story.media) return;
      const isVideo = story.mediaType === "video" || /\.(mp4|webm|mov)(\?|#|$)/i.test(story.media);
      if (isVideo) {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.src = story.media;
        video.load();
        return;
      }
      const image = new Image();
      image.decoding = "async";
      image.src = story.media;
    });
  }, [all]);

  return (
    <>
      <div className="stories-strip -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex w-20 shrink-0 snap-start flex-col items-center gap-2"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-accent bg-card transition hover:shadow-soft">
            <Plus className="h-6 w-6 text-accent" />
          </div>
          <span className="truncate text-xs font-medium">{uploading ? "Envoi…" : "Ta story"}</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*,video/*" hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        {storyBubbles.length === 0 && (
          <div className="stories-empty flex min-w-0 flex-1 items-center px-2 text-xs leading-relaxed text-muted-foreground">
            Suis des voyageurs pour voir leurs stories ici.
          </div>
        )}
        {storyBubbles.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => setViewerIdx(Math.max(0, all.findIndex((story) => (story.userId ?? story.username) === (s.userId ?? s.username))))}
            className="flex w-20 shrink-0 snap-start flex-col items-center gap-2"
          >
            <div className="rounded-full p-[2px] gradient-sunset">
              <div className="rounded-full bg-background p-[2px]">
                <div className="h-14 w-14 overflow-hidden rounded-full bg-muted">
                  {s.avatar ? <img src={s.avatar} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-sm font-semibold text-muted-foreground">{s.username[0]?.toUpperCase()}</span>}
                </div>
              </div>
            </div>
            <span className="truncate w-full text-center text-xs text-muted-foreground">@{s.username}</span>
          </button>
        ))}
      </div>
      {viewerIdx !== null && (
        <StoriesViewer stories={all} startIndex={viewerIdx} onClose={() => setViewerIdx(null)} />
      )}
    </>
  );
}



function FeedPage() {
  const { user } = useAuth();
  const [country, setCountry] = useState<string>("");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const runSearch = () => {
    const q = query.trim();
    if (q) navigate({ to: "/search", search: { q } });
  };
  const [tab, setTab] = useState<FeedTab>("foryou");
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const dailyKey = useDailyContentKey();
  const dailyDestinations = useMemo(() => dailyRotation(TRENDING_DESTINATIONS, 6, "destinations"), [dailyKey]);
  const dailyTravelers = useMemo(() => dailyRotation(NEARBY_TRAVELERS, 4, "travelers"), [dailyKey]);
  const dailyActivities = useMemo(() => dailyRotation(POPULAR_ACTIVITIES, 6, "activities"), [dailyKey]);
  const dailyQuestions = useMemo(() => dailyRotation(COMMUNITY_QUESTIONS, 4, "questions"), [dailyKey]);
  const loadDailyDiscovery = useServerFn(getDailyDiscovery);
  const { data: liveDailyDiscovery } = useQuery({
    queryKey: ["daily-discovery", dailyKey],
    queryFn: () => loadDailyDiscovery(),
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  // Real "photos of the day": most engaging recent posts, deterministic per day.
  const { data: photosOfTheDay = [] } = useQuery({
    queryKey: ["photos-of-the-day", new Date().toISOString().slice(0, 10)],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("posts")
        .select("id, image_url, city, country, created_at, profiles(username), post_likes(user_id)")
        .not("image_url", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? [])
        .map((p) => ({
          id: p.id,
          image: p.image_url,
          author: (p.profiles as { username?: string } | null)?.username ?? "voyageur",
          location: [p.city, p.country].filter(Boolean).join(", "),
          likes: (p.post_likes as { user_id: string }[] | null)?.length ?? 0,
        }))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, 4);
    },
  });
  const [countrySheet, setCountrySheet] = useState<string | null>(null);



  // Ask for geolocation once when the user opens the "Près de toi" tab
  useEffect(() => {
    if (tab !== "nearby" || userLoc || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLoc({ lat: 48.8566, lng: 2.3522 }), // fallback: Paris
      { timeout: 4000 },
    );
  }, [tab, userLoc]);

  // Who does the current user follow? (usernames rank the demo feed; ids power real stories/posts)
  const { data: followData } = useQuery({
    queryKey: ["my-follows", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("follows")
        .select("following_id, profiles:profiles!follows_following_id_fkey(username)")
        .eq("follower_id", user!.id);
      return data ?? [];
    },
  });
  const followingIds = useMemo(() => new Set((followData ?? []).map((r: any) => r.following_id as string)), [followData]);
  const followingUsernames = useMemo(
    () => new Set<string>((followData ?? []).map((r: any) => r.profiles?.username).filter(Boolean) as string[]),
    [followData],
  );

  const interests = useMemo(() => new Set<string>(country ? [country] : []), [country]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["feed", country, tab, followingIds.size],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // Nearby feed relies on mock posts with lat/lng; DB posts don't have coordinates.
      if (tab === "nearby") return [] as any[];
      // Following with no follows → nothing from DB.
      if (tab === "following" && followingIds.size === 0) return [] as any[];
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("posts")
        .select("*, profiles(username, display_name, avatar_url), post_likes(user_id), comments(count), post_media(id, url, media_type, position)")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (country) q = q.eq("country", country);
      if (tab === "following" && followingIds.size > 0) q = q.in("user_id", Array.from(followingIds));
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length),
  });

  // Merge DB posts with mock posts ranked by the current algorithm.
  const dbPosts = data?.pages.flat() ?? [];
  const rankedMocks: MockPost[] = useMemo(
    () => rankMockPosts(tab, { followingUsernames, userLocation: userLoc, interests })
      .filter((m) => !country || m.country === country),
    [tab, followingUsernames, userLoc, interests, country],
  );

  // Interleave: keep DB posts on top for followed/self, weave mocks in-between for "for you".
  const posts = useMemo(() => {
    if (tab === "following") return [...dbPosts, ...rankedMocks];
    if (tab === "nearby") return [...rankedMocks, ...dbPosts];
    // "foryou": alternate 1 db / 2 mocks so real users get spotlight but the feed stays rich
    const out: any[] = [];
    let i = 0, j = 0;
    while (i < dbPosts.length || j < rankedMocks.length) {
      if (i < dbPosts.length) out.push(dbPosts[i++]);
      if (j < rankedMocks.length) out.push(rankedMocks[j++]);
      if (j < rankedMocks.length) out.push(rankedMocks[j++]);
    }
    return out;
  }, [dbPosts, rankedMocks, tab]);

  // Infinite scroll sentinel
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinel.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const filteredCountries = query
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const TABS: { key: FeedTab; label: string; icon: any; hint: string }[] = [
    { key: "foryou", label: "Pour toi", icon: Sparkles, hint: "Sélection premium" },
    { key: "following", label: "Suivis", icon: Users, hint: "Tes voyageurs" },
    { key: "nearby", label: "Près de toi", icon: Navigation, hint: "Autour de ta position" },
  ];

  return (
    <div className="app-page">
      <AppHeader />

      {/* STORIES — right under the header, no scrolling needed */}
      <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="stories-card surface-card px-3 py-3 sm:px-4">
          <StoriesBar followingIds={followingIds} />
        </div>
      </section>

      {/* Compact discovery bar: useful without recreating a large hero. */}
      <section className="mx-auto max-w-6xl px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="discovery-card surface-card relative p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="discovery-search flex min-w-0 flex-1 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder="Ville, pays ou activité…"
                  className="h-12 rounded-2xl border-border/70 bg-background/75 pl-11 pr-4"
                />
              </div>
              <Button onClick={runSearch} disabled={!query.trim()} aria-label="Lancer la recherche" className="h-12 shrink-0 rounded-2xl px-3 sm:px-5">
                <Search className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">Explorer</span>
              </Button>
              {filteredCountries.length > 0 && (
                <div className="absolute inset-x-0 top-[calc(100%+.5rem)] z-30 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl sm:right-auto sm:min-w-[360px]">
                  {filteredCountries.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        const info = COUNTRY_BY_NAME.get(name.toLowerCase());
                        setQuery("");
                        if (info) setCountrySheet(info.code);
                        else setCountry(name);
                      }}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-secondary"
                    >
                      <span>{name}</span><ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="discovery-shortcuts grid grid-cols-4 gap-2 lg:flex">
              <Link to="/map" className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 text-xs font-semibold text-muted-foreground hover:border-primary/25 hover:text-foreground sm:text-sm"><MapPin className="h-4 w-4 text-accent" /> Carte</Link>
              <Link to="/ai-trip" className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 text-xs font-semibold text-muted-foreground hover:border-primary/25 hover:text-foreground sm:text-sm"><Sparkles className="h-4 w-4 text-accent" /> Assistant</Link>
              <Link to={user ? "/match" : "/auth"} className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background/70 px-3 text-xs font-semibold text-muted-foreground hover:border-primary/25 hover:text-foreground sm:text-sm"><Users className="h-4 w-4 text-accent" /> Match</Link>
              <Link to={user ? "/ai-pro" : "/auth"} className="pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-3 text-xs font-semibold text-muted-foreground hover:border-amber-500/40 hover:text-foreground sm:text-sm"><Crown className="h-4 w-4 text-amber-500" /> Conseiller</Link>
            </div>
          </div>
        </div>
      </section>

      {liveDailyDiscovery?.items?.length ? (
        <section className="mx-auto max-w-6xl px-4 pt-4" aria-labelledby="daily-radar-title">
          <div className="surface-card rounded-[1.75rem] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-accent"><Radar className="h-3.5 w-3.5" /> Actualisé aujourd'hui</div>
                <h2 id="daily-radar-title" className="mt-0.5 font-display text-xl">Radar voyage du jour</h2>
              </div>
              <Link to="/ai-pro" className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-border/70 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground sm:inline-flex">Ouvrir le conseiller <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {liveDailyDiscovery.items.slice(0, 6).map((item) => (
                <a
                  key={`${item.kind}-${item.title}`}
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pressable min-w-[250px] flex-1 snap-start rounded-2xl border border-border/65 bg-background/70 p-3.5 hover:border-accent/30 sm:min-w-[290px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-primary/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">{item.kind === "destination" ? "Destination" : item.kind === "activity" ? "Activité" : item.kind === "deal" ? "Bon plan" : "Actualité"}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-sm font-bold leading-snug">{item.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.summary}</p>
                  <p className="mt-2 truncate text-[10px] text-muted-foreground">Source : {item.sourceTitle}</p>
                </a>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* TABBED FEED — the heart of GlobeLink */}
      <section className="feed-shell mx-auto max-w-2xl px-3 py-7 sm:px-4 sm:py-9">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
              <Compass className="h-4 w-4" /> Ton fil
            </div>
            <h2 className="mt-1 font-display text-3xl">Fil d'actualité</h2>
          </div>
          <Link to="/new-post" className="hidden shrink-0 items-center gap-1 rounded-full gradient-hero px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:shadow-glow sm:inline-flex">
            <Plus className="h-4 w-4" /> Publier
          </Link>
        </div>

        {/* Tabs — sticky under header on scroll */}
        <div className="feed-tabs sticky top-[3.75rem] z-20 -mx-3 mb-5 border-b border-border/60 bg-background/92 px-3 backdrop-blur-md sm:-mx-4 sm:px-4">
          <div className="flex gap-0.5 py-1.5">
            {TABS.map((t) => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`group relative flex-1 rounded-xl px-1.5 py-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <Icon className={`h-4 w-4 transition ${active ? "text-accent" : ""}`} />
                    {t.label}
                  </span>
                  {active && <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full gradient-hero" />}
                </button>
              );
            })}
          </div>
        </div>

        {tab === "nearby" && !userLoc && (
          <div className="mb-4 rounded-2xl border border-dashed border-accent/40 bg-accent/5 p-4 text-center text-sm text-muted-foreground">
            <Globe2 className="mx-auto mb-2 h-6 w-6 text-accent" />
            On cherche des contenus près de toi… autorise la géolocalisation.
          </div>
        )}
        {tab === "following" && !user && (
          <div className="mb-4 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="font-semibold text-accent underline">Connecte-toi</Link> pour voir les publications des voyageurs que tu suis.
          </div>
        )}

        {isLoading && posts.length === 0 ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
            {tab === "following"
              ? <>Suis des voyageurs pour voir leurs publications ici.</>
              : <>Aucune publication pour l'instant. <Link to="/new-post" className="text-accent underline">Sois le premier à publier</Link>.</>}
          </div>
        ) : (
          <div className="feed-list space-y-5">
            {posts.map((p: any, i: number) => (
              <div key={p.id} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }} className="animate-rise">
                <PostCard post={p} />
              </div>
            ))}
          </div>
        )}
        <div ref={sentinel} className="h-10" />
        {isFetchingNextPage && (
          <div className="mt-4 space-y-6"><PostCardSkeleton /></div>
        )}
        {!hasNextPage && posts.length > 0 && (
          <p className="mt-8 text-center text-xs text-muted-foreground">Tu as tout vu pour l’instant</p>
        )}
      </section>



      {/* TRENDING DESTINATIONS */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHeader icon={TrendingUp} subtitle={`Sélection du jour · ${dailyRefreshLabel()}`} title="Destinations tendances" cta={{ label: "Voir la carte", to: "/map" }} />
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {dailyDestinations.map((d, i) => {
            const info = COUNTRY_BY_NAME.get(d.country.toLowerCase());
            return (
              <button
                type="button"
                key={d.name}
                onClick={() => {
                  if (info) setCountrySheet(info.code);
                  else { setCountry(d.country); window.scrollTo({ top: 0, behavior: "smooth" }); }
                }}
                style={{ animationDelay: `${i * 60}ms` }}
                className="animate-rise group relative aspect-[3/4] w-64 shrink-0 snap-start overflow-hidden rounded-3xl text-left shadow-soft transition hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"
              >
                <img src={d.image} alt={d.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute left-4 top-4">
                  <span className="rounded-full glass px-2.5 py-1 text-xs font-medium text-white">{d.tag}</span>
                </div>
                <div className="absolute inset-x-4 bottom-4 text-white">
                  <h3 className="font-display text-2xl leading-tight">{d.name}</h3>
                  <p className="text-sm opacity-90">{d.country} · {d.posts.toLocaleString("fr-FR")} publications</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* PHOTOS OF THE DAY */}
      <section className="border-y border-border/50 bg-card/35 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeader icon={Sparkles} subtitle="Le meilleur d'aujourd'hui" title="Les plus belles photos du jour" cta={{ label: "Explorer le fil", to: "/" }} />
          {photosOfTheDay.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Aucune photo publiée pour le moment — sois le premier à partager la tienne.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {photosOfTheDay.map((p, i) => (
                <Link
                  key={p.id}
                  to="/post/$id"
                  params={{ id: p.id }}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="animate-rise group relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted text-left shadow-soft transition hover:shadow-elevated"
                >
                  <img src={p.image} alt={p.location || "Photo de voyage"} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 text-white">
                    <p className="truncate text-xs opacity-90">@{p.author}</p>
                    {p.location && <p className="flex items-center gap-1 truncate text-sm font-medium"><MapPin className="h-3 w-3" /> {p.location}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs"><Heart className="h-3 w-3 fill-white" /> {p.likes.toLocaleString("fr-FR")}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* DEALS */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHeader icon={Flame} subtitle={`Renouvelées chaque jour · ${dealsRefreshLabel()}`} title="Offres du moment" cta={{ label: "Toutes les offres", to: "/deals" }} />
        <div className="grid gap-5 md:grid-cols-3">
          {dealsOfTheDay(3).map((d, i) => (
            <Link
              key={d.slug}
              to="/deals/$slug"
              params={{ slug: d.slug }}
              style={{ animationDelay: `${i * 60}ms` }}
              className="animate-rise group overflow-hidden rounded-3xl border border-border bg-card text-left shadow-soft transition hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img src={d.image} alt={d.title} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <span className="absolute left-3 top-3 rounded-full gradient-sunset px-2.5 py-1 text-xs font-semibold text-white shadow-soft">{d.badge}</span>
              </div>
              <div className="p-5">
                <h3 className="font-display text-lg">{d.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{d.destination} · {d.partner}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-display text-2xl text-accent">{d.price}</span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">Voir l'offre</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* NEARBY */}
      <section className="border-y border-border/50 bg-card/35 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeader icon={Users} subtitle="Autour de toi" title="Voyageurs près de chez vous" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dailyTravelers.map((t, i) => (
              <Link
                key={t.username}
                to="/profile/$username"
                params={{ username: t.username }}
                style={{ animationDelay: `${i * 40}ms` }}
                className="animate-rise group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <img src={t.avatar} alt={t.displayName} className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-transparent transition group-hover:ring-accent/40" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.displayName} <span className="text-xs font-normal text-muted-foreground">· {t.age} ans</span></p>
                  <p className="truncate text-xs text-muted-foreground">@{t.username} · {t.city} · à {t.km} km</p>
                  <p className="mt-1 truncate text-xs text-accent">{t.next}</p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}

          </div>
        </div>
      </section>

      {/* ACTIVITIES */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <SectionHeader icon={Zap} subtitle={`Sélection quotidienne · ${dailyRefreshLabel()}`} title="Activités populaires" />
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {dailyActivities.map((a, i) => (
            <Link to="/activities/$slug" params={{ slug: a.slug }} key={a.title} style={{ animationDelay: `${i * 60}ms` }} className="animate-rise group relative aspect-[3/4] w-64 shrink-0 snap-start overflow-hidden rounded-3xl shadow-soft transition hover:-translate-y-1 hover:shadow-elevated sm:w-auto text-left">
              <img src={a.image} alt={a.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-110" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full glass px-2 py-1 text-xs font-semibold text-white">
                <Star className="h-3 w-3 fill-accent text-accent" /> {a.rating}
              </div>
              <div className="absolute inset-x-4 bottom-4 text-white">
                <h3 className="font-display text-xl leading-tight">{a.title}</h3>
                <p className="mt-1 flex items-center gap-1 text-sm opacity-90"><MapPin className="h-3 w-3" /> {a.place}</p>
                <p className="mt-2 text-xs opacity-90">à partir de <span className="font-semibold">{a.price}</span> · {a.duration}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* QUESTIONS */}
      <section className="border-y border-border/50 bg-card/35 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <SectionHeader icon={MessageCircle} subtitle={`Nouvelles discussions chaque jour · ${dailyRefreshLabel()}`} title="Questions de la communauté" />
          <div className="grid gap-4 md:grid-cols-2">
            {dailyQuestions.map((q, i) => (
              <Link to="/questions/$slug" params={{ slug: q.slug }} key={q.slug} style={{ animationDelay: `${i * 50}ms` }} className="animate-rise group rounded-2xl border border-border bg-card p-5 text-left shadow-soft transition hover:-translate-y-1 hover:shadow-elevated">
                <div className="flex items-start gap-4">
                  <div className="grid shrink-0 place-items-center rounded-xl gradient-glow p-3 text-primary-foreground">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">🌍 {q.country}</span>
                    <h3 className="mt-2 font-display text-lg leading-snug">{q.q}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>par @{q.author}</span>
                      <span>· {q.answers} réponses</span>
                      <span>· {q.votes} votes</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

          </div>
        </div>
      </section>

      <CountrySheet code={countrySheet} onOpenChange={(o) => { if (!o) setCountrySheet(null); }} />

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        GlobeLink — Voyager, partager, se rencontrer.
      </footer>
    </div>

  );
}
