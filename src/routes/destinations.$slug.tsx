import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  Compass,
  Flame,
  Hotel,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CatalogImage } from "@/components/CatalogImage";
import { DestinationImage } from "@/components/DestinationImage";
import { Button } from "@/components/ui/button";
import { AddToTripButton } from "@/components/AddToTripButton";
import { AIContextActions } from "@/components/AIContextActions";
// AI_CONTEXT_LAYER_V1_DESTINATION
// ADD_TO_TRIP_EVERYWHERE_V1_DESTINATION
import { supabase } from "@/integrations/supabase/client";
import { COUNTRY_INFO } from "@/lib/country-info";
import { verifiedDestinationCover } from "@/lib/destination-cover";
import {
  catalogOfficialWebsite,
  fetchPersistedViewportCatalog,
  itemLocation,
  type LiveCatalogItem,
} from "@/lib/live-catalog";
import {
  catalogIdentityKey,
  getCachedViewportCatalog,
  saveCachedViewportCatalog,
} from "@/lib/viewport-catalog-cache";
import { fetchBrowserViewportCatalog } from "@/lib/browser-viewport-catalog";
import { searchInternetCatalog } from "@/lib/public-travel-catalog.functions";
import { fetchGoogleDestinationCatalog } from "@/lib/google-destination-catalog.functions";
import { getSignedMediaUrl } from "@/lib/storage";
import { WORLD_MAP_HUBS } from "@/lib/world-map-hubs";
import { curatedActivitiesForCountry } from "@/lib/world-activities";
import { normalizeText, slugifyDestination } from "@/lib/phase2";
import { useAuth } from "@/lib/auth-context";
import { isTrustedVisibleCatalogItem } from "@/lib/catalog-source-routing";

export const Route = createFileRoute("/destinations/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug.replace(/-/g, " ")} — GlobeLink` }] }),
  component: DestinationPage,
});

type DestinationRecord = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string;
  cover_url: string | null;
  summary: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  tags: string[] | null;
  rating: number | null;
};

function DestinationPage() {
  const { slug } = Route.useParams();
  return <DestinationDetail slug={slug} />;
}

function DestinationDetail({ slug }: { slug: string }) {
  const { user } = useAuth();
  const fallbackInfo = COUNTRY_INFO.find((item) => slugifyDestination(item.name) === slug);

  const { data: destination } = useQuery({
    queryKey: ["phase2-destination-record", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("destinations")
        .select(
          "id,name,slug,city,country,cover_url,summary,description,latitude,longitude,tags,rating",
        )
        .eq("slug", slug)
        .maybeSingle();
      return (data as DestinationRecord | null) ?? null;
    },
    staleTime: 10 * 60_000,
  });

  const slugHub = WORLD_MAP_HUBS.find((hub) => slugifyDestination(hub.country) === slug);
  const country =
    destination?.country ?? fallbackInfo?.name ?? slugHub?.country ?? slug.replace(/-/g, " ");
  const city = destination?.city ?? null;
  const title = destination?.name ?? fallbackInfo?.name ?? country;
  const destinationHub = useMemo(() => {
    const countryNeedle = normalizeText(country);
    const cityNeedle = normalizeText(city);
    const exactCity = cityNeedle
      ? WORLD_MAP_HUBS.find(
          (hub) =>
            normalizeText(hub.city) === cityNeedle && normalizeText(hub.country) === countryNeedle,
        )
      : null;
    return (
      exactCity ??
      WORLD_MAP_HUBS.find((hub) => normalizeText(hub.country) === countryNeedle) ??
      null
    );
  }, [city, country]);
  const catalogCity = city ?? destinationHub?.city ?? null;

  const latitude = destination?.latitude ?? destinationHub?.lat ?? null;
  const longitude = destination?.longitude ?? destinationHub?.lng ?? null;
  const bounds = useMemo(
    () =>
      latitude != null && longitude != null
        ? {
            south: latitude - 0.055,
            west: longitude - 0.08,
            north: latitude + 0.055,
            east: longitude + 0.08,
            zoom: 14,
          }
        : null,
    [latitude, longitude],
  );

  const normalizeCatalog = useCallback(
    (rows: LiveCatalogItem[]) =>
      rows
        .filter((item) => item.kind === "deal" || isTrustedVisibleCatalogItem(item))
        .filter(
          (item, index, all) =>
            all.findIndex(
              (candidate) => catalogIdentityKey(candidate) === catalogIdentityKey(item),
            ) === index,
        )
        .map((item) => ({
          ...item,
          city: item.city || catalogCity || null,
          country: item.country || country || null,
        }))
        .slice(0, 120),
    [catalogCity, country],
  );

  const cachedCatalog = useMemo(
    () =>
      bounds && typeof window !== "undefined"
        ? normalizeCatalog(getCachedViewportCatalog(bounds))
        : [],
    [bounds, normalizeCatalog],
  );

  const requireRows = async (promise: Promise<LiveCatalogItem[]>, label: string) => {
    const rows = await promise;
    if (!rows.length) throw new Error(`${label}: aucun lieu`);
    return rows;
  };

  // Fast first paint: whichever trusted source answers first wins. Cached map rows are
  // shown immediately through placeholderData while Google/DB/OSM refresh in parallel.
  const fastCatalogQuery = useQuery({
    queryKey: ["destination-fast-catalog-v7", slug, catalogCity, country, latitude, longitude],
    enabled: !!bounds && !!catalogCity,
    placeholderData: cachedCatalog,
    queryFn: async () => {
      if (!bounds || !catalogCity || latitude == null || longitude == null)
        return [] as LiveCatalogItem[];
      // The free/public catalog is always queried and merged. A partial response from
      // Google, Booking or the database must never suppress OpenStreetMap/Wikidata
      // hotels, restaurants or activities.
      const requests: Promise<LiveCatalogItem[]>[] = [
        (
          searchInternetCatalog({ data: { query: `${catalogCity}, ${country}` } }) as Promise<
            LiveCatalogItem[]
          >
        ).catch(() => []),
        fetchPersistedViewportCatalog(bounds).catch(() => []),
        (
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>
        ).catch(() => []),
      ];
      if (typeof window !== "undefined") {
        requests.push(
          (
            fetchBrowserViewportCatalog(bounds, { mode: "fast" }) as Promise<LiveCatalogItem[]>
          ).catch(() => []),
        );
      }
      const settled = await Promise.allSettled(requests);
      const rows = normalizeCatalog(
        settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      );
      if (rows.length) saveCachedViewportCatalog(bounds, rows);
      return rows;
    },
    staleTime: 3 * 60_000,
    retry: false,
  });

  // Enrich in the background without holding the destination page hostage. This
  // can add missing categories after the first cards are already visible.
  const fullCatalogQuery = useQuery({
    queryKey: ["destination-full-catalog-v7", slug, catalogCity, country, latitude, longitude],
    enabled: !!bounds && !!catalogCity && !fastCatalogQuery.isLoading,
    queryFn: async () => {
      if (!bounds || !catalogCity || latitude == null || longitude == null)
        return [] as LiveCatalogItem[];
      const requests: Promise<LiveCatalogItem[]>[] = [
        (
          fetchGoogleDestinationCatalog({
            data: { city: catalogCity, country, latitude, longitude },
          }) as Promise<LiveCatalogItem[]>
        ).catch(() => []),
        fetchPersistedViewportCatalog(bounds).catch(() => []),
        (
          searchInternetCatalog({ data: { query: `${catalogCity}, ${country}` } }) as Promise<
            LiveCatalogItem[]
          >
        ).catch(() => []),
      ];
      if (typeof window !== "undefined") {
        requests.push(
          (
            fetchBrowserViewportCatalog(bounds, { mode: "full" }) as Promise<LiveCatalogItem[]>
          ).catch(() => []),
        );
      }
      const settled = await Promise.allSettled(requests);
      const rows = normalizeCatalog(
        settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      );
      if (rows.length) saveCachedViewportCatalog(bounds, rows);
      return rows;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  const catalog = useMemo(
    () => normalizeCatalog([...(fastCatalogQuery.data ?? []), ...(fullCatalogQuery.data ?? [])]),
    [fastCatalogQuery.data, fullCatalogQuery.data, normalizeCatalog],
  );

  const socialQuery = useQuery({
    queryKey: ["destination-social-v2", slug, country],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [postsRes, intentsRes, questionsRes] = await Promise.all([
        supabase
          .from("posts")
          .select(
            "id,caption,image_url,city,country,created_at,profiles:user_id(username,display_name,avatar_url)",
          )
          .ilike("country", `%${country}%`)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("travel_intents")
          .select("id,user_id,destination_city,destination_country,starts_on,ends_on,interests")
          .eq("visibility", "public")
          .ilike("destination_country", `%${country}%`)
          .gte("ends_on", today)
          .order("starts_on", { ascending: true })
          .limit(24),
        supabase
          .from("community_questions")
          .select("id,slug,title,country,author_username,votes")
          .ilike("country", `%${country}%`)
          .order("votes", { ascending: false })
          .limit(8),
      ]);
      const posts = await Promise.all(
        (postsRes.data ?? []).map(async (post) => ({
          ...post,
          signedImage: post.image_url ? await getSignedMediaUrl(post.image_url) : null,
        })),
      );
      const profileIds = Array.from(
        new Set((intentsRes.data ?? []).map((intent) => intent.user_id)),
      );
      let profileById = new Map<
        string,
        { username: string; display_name: string | null; avatar_url: string | null }
      >();
      if (profileIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id,username,display_name,avatar_url")
          .in("id", profileIds);
        const signedProfiles = await Promise.all(
          (profiles ?? []).map(async (profile) => ({
            ...profile,
            avatar_url: profile.avatar_url ? await getSignedMediaUrl(profile.avatar_url) : null,
          })),
        );
        profileById = new Map(signedProfiles.map((profile) => [profile.id, profile]));
      }
      const intents = (intentsRes.data ?? []).map((intent) => ({
        ...intent,
        profile: profileById.get(intent.user_id) ?? null,
      }));
      return { posts, intents, questions: questionsRes.data ?? [] };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const isCatalogFetching = fastCatalogQuery.isFetching || fullCatalogQuery.isFetching;
  const isCatalogLoading = !catalog.length && isCatalogFetching;
  const reloadCatalog = () => Promise.all([fastCatalogQuery.refetch(), fullCatalogQuery.refetch()]);

  const activityCatalog = useMemo(() => {
    const live = normalizeCatalog(catalog.filter((item) => item.kind === "activity"));
    return live.length ? live : normalizeCatalog(curatedActivitiesForCountry(country));
  }, [catalog, country, normalizeCatalog]);

  const groups = {
    activity: activityCatalog.slice(0, 8),
    restaurant: catalog.filter((item) => item.kind === "restaurant").slice(0, 8),
    hotel: catalog.filter((item) => item.kind === "hotel").slice(0, 8),
    deal: catalog.filter((item) => item.kind === "deal").slice(0, 6),
  };

  const cover = verifiedDestinationCover(destination?.cover_url);
  const intro =
    destination?.summary ||
    destination?.description ||
    fallbackInfo?.intro ||
    `Explore ${title} avec les lieux, voyageurs et publications GlobeLink disponibles aujourd'hui.`;

  return (
    <div className="app-page pb-24">
      <AppHeader />
      <main>
        <section className="relative min-h-[360px] overflow-hidden border-b border-border bg-slate-900 text-white sm:min-h-[430px]">
          <div className="absolute inset-0">
            <DestinationImage
              title={title}
              country={country}
              storedUrl={cover}
              emoji={fallbackInfo?.emoji}
              priority
              className="h-full w-full object-cover"
              placeholderClassName="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,164,.42),transparent_38%),radial-gradient(circle_at_80%_30%,rgba(14,116,144,.38),transparent_42%),linear-gradient(135deg,#071a24,#0b3440_55%,#102a35)]"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-slate-950/15" />
          <div className="relative mx-auto flex min-h-[360px] max-w-6xl flex-col justify-end px-4 py-8 sm:min-h-[430px] sm:py-12">
            <div className="mb-3 flex flex-wrap gap-2">
              {(destination?.tags ?? fallbackInfo?.tags ?? []).slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/25 bg-black/25 px-3 py-1 text-xs backdrop-blur"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-sm font-semibold uppercase tracking-[.16em] text-white/75">
              Destination GlobeLink
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold sm:text-6xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">
              {intro}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="rounded-full bg-white text-slate-950 hover:bg-white/90">
                <Link to="/map">
                  <MapIcon className="mr-2 h-4 w-4" />
                  Explorer la carte
                </Link>
              </Button>
              <AddToTripButton
                item={{
                  title,
                  city: catalogCity,
                  country,
                  lat: latitude,
                  lng: longitude,
                  kind: "stop",
                  source: "Destination GlobeLink",
                }}
                label="Ajouter cette destination"
                variant="outline"
                className="rounded-full border-white/40 bg-black/20 text-white hover:bg-white/10 hover:text-white"
              />
              <AIContextActions
                destination={[catalogCity, country].filter(Boolean).join(", ")}
                freePrompt={`Donne-moi les meilleurs conseils rapides pour préparer un voyage à ${title}, avec les incontournables et les erreurs à éviter.`}
                proPrompt={`Recherche et organise un voyage à ${title}. Compare les meilleurs quartiers, hôtels, restaurants et activités adaptés à mes dates et à mon budget.`}
                proMode="research"
                freeLabel="Demander à GlobeLink"
                proLabel="Préparer avec IA+"
                dark
              />
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/40 bg-black/20 text-white hover:bg-white/10 hover:text-white"
              >
                {user ? (
                  <Link to="/match">
                    <Users className="mr-2 h-4 w-4" />
                    Travel Match
                  </Link>
                ) : (
                  <Link to="/auth" search={{ redirect: "/match" }}>
                    <Users className="mr-2 h-4 w-4" />
                    Travel Match
                  </Link>
                )}
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto -mt-4 grid max-w-6xl gap-3 px-4 sm:grid-cols-4">
          <Metric
            icon={<Users className="h-4 w-4" />}
            value={socialQuery.data?.intents.length ?? 0}
            label="voyageurs à venir"
          />
          <Metric
            icon={<Compass className="h-4 w-4" />}
            value={groups.activity.length}
            label="activités sélectionnées"
          />
          <Metric
            icon={<Utensils className="h-4 w-4" />}
            value={groups.restaurant.length}
            label="restaurants visibles"
          />
          <Metric
            icon={<Hotel className="h-4 w-4" />}
            value={groups.hotel.length}
            label="hébergements visibles"
          />
        </section>

        <div className="mx-auto max-w-6xl space-y-12 px-4 py-10">
          {!isCatalogLoading && !catalog.length && !isCatalogFetching && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="font-semibold">
                  Les lieux autour de {catalogCity || title} n'ont pas répondu.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  GlobeLink peut relancer immédiatement la même recherche temps réel que la carte.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 rounded-full sm:mt-0"
                disabled={isCatalogFetching}
                onClick={() => void reloadCatalog()}
              >
                {isCatalogFetching ? "Chargement…" : `Recharger autour de ${catalogCity || title}`}
              </Button>
            </section>
          )}
          {fallbackInfo && (
            <section className="grid gap-3 sm:grid-cols-3">
              <InfoCard label="Meilleure période" value={fallbackInfo.bestTime} />
              <InfoCard label="Budget indicatif / jour" value={fallbackInfo.costPerDay} />
              <InfoCard label="Langue principale" value={fallbackInfo.language} />
            </section>
          )}

          <CatalogRail
            title="À faire sur place"
            icon={<Sparkles className="h-4 w-4" />}
            items={groups.activity}
            loading={isCatalogLoading}
            fallbackCity={catalogCity}
            fallbackCountry={country}
          />
          <CatalogRail
            title="Restaurants"
            icon={<Utensils className="h-4 w-4" />}
            items={groups.restaurant}
            loading={isCatalogLoading}
            fallbackCity={catalogCity}
            fallbackCountry={country}
          />
          <CatalogRail
            title="Hébergements"
            icon={<Hotel className="h-4 w-4" />}
            items={groups.hotel}
            loading={isCatalogLoading}
            fallbackCity={catalogCity}
            fallbackCountry={country}
          />
          {groups.deal.length > 0 && (
            <CatalogRail
              title="Offres disponibles"
              icon={<Flame className="h-4 w-4" />}
              items={groups.deal}
              loading={isCatalogLoading}
              fallbackCity={catalogCity}
              fallbackCountry={country}
            />
          )}

          <section>
            <SectionTitle
              icon={<Users className="h-4 w-4" />}
              title="Voyageurs sur cette destination"
              subtitle="Profils ayant publié des dates de voyage publiques."
            />
            {socialQuery.data?.intents.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {socialQuery.data!.intents.slice(0, 9).map((intent) => {
                  const profile = intent.profile;
                  const name = profile?.display_name ?? profile?.username ?? "Voyageur GlobeLink";
                  const card = (
                    <>
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-semibold">
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          name[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <CalendarDays className="mr-1 inline h-3 w-3" />
                          {new Date(intent.starts_on).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          →{" "}
                          {new Date(intent.ends_on).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <MapPin className="mr-1 inline h-3 w-3" />
                          {[intent.destination_city, intent.destination_country]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    </>
                  );
                  return profile?.username ? (
                    <Link
                      key={intent.id}
                      to="/profile/$username"
                      params={{ username: profile.username }}
                      className="surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5"
                    >
                      {card}
                    </Link>
                  ) : (
                    <Link
                      key={intent.id}
                      to="/match"
                      className="surface-card flex items-center gap-3 rounded-2xl p-3 transition hover:-translate-y-0.5"
                    >
                      {card}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty text="Aucun voyageur n'a encore publié ses dates ici." />
            )}
          </section>

          <section>
            <SectionTitle
              icon={<MessageCircle className="h-4 w-4" />}
              title="Questions de la communauté"
              subtitle="Les réponses locales les plus utiles remontent en premier."
            />
            {socialQuery.data?.questions.length ? (
              <div className="grid gap-2">
                {socialQuery.data!.questions.map((question) => (
                  <Link
                    key={question.id}
                    to="/questions/$slug"
                    params={{ slug: question.slug }}
                    className="surface-card flex items-center gap-3 rounded-2xl p-4"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      {question.votes}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{question.title}</p>
                      <p className="text-xs text-muted-foreground">@{question.author_username}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty text="Aucune question communautaire sur cette destination pour le moment." />
            )}
          </section>

          <section>
            <SectionTitle
              icon={<MapPin className="h-4 w-4" />}
              title="Publications récentes"
              subtitle="Contenu réellement publié par la communauté GlobeLink."
            />
            {socialQuery.data?.posts.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {socialQuery.data!.posts.slice(0, 8).map((post: any) => (
                  <Link
                    key={post.id}
                    to="/post/$id"
                    params={{ id: post.id }}
                    className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-secondary"
                  >
                    {post.signedImage ? (
                      <img
                        src={post.signedImage}
                        alt=""
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full place-items-center px-4 text-center text-xs text-muted-foreground">
                        Publication sans photo
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 p-3 pt-10 text-xs text-white">
                      <p className="line-clamp-2">
                        {post.caption || [post.city, post.country].filter(Boolean).join(", ")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty text="Aucune publication récente trouvée pour cette destination." />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="surface-card relative z-10 flex items-center gap-3 rounded-2xl p-4">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
        {icon} GlobeLink
      </div>
      <h2 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
function CatalogRail({
  title,
  icon,
  items,
  loading,
  fallbackCity,
  fallbackCountry,
}: {
  title: string;
  icon: ReactNode;
  items: LiveCatalogItem[];
  loading: boolean;
  fallbackCity?: string | null;
  fallbackCountry?: string | null;
}) {
  return (
    <section>
      <SectionTitle
        icon={icon}
        title={title}
        subtitle="Lieux affichés uniquement quand la source est traçable. Aucune photo générique n’est utilisée."
      />
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((item, index) => {
            const card = (
              <>
                <div className="aspect-[4/3] overflow-hidden bg-secondary">
                  <CatalogImage
                    item={item}
                    fallbackIndex={index}
                    lookup={{
                      latitude: item.latitude,
                      longitude: item.longitude,
                      city: item.city ?? fallbackCity,
                      country: item.country ?? fallbackCountry,
                      website: catalogOfficialWebsite(item),
                    }}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="line-clamp-1 font-semibold">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {itemLocation(item)}
                  </p>
                </div>
              </>
            );
            return (
              <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                {item.kind === "deal" ? (
                  <Link
                    to="/deals/$slug"
                    params={{ slug: item.slug }}
                    className="group block overflow-hidden"
                  >
                    {card}
                  </Link>
                ) : (
                  <Link
                    to="/activities/$slug"
                    params={{ slug: item.slug }}
                    className="group block overflow-hidden"
                  >
                    {card}
                  </Link>
                )}
                <div className="border-t border-border/70 p-2">
                  <AddToTripButton
                    item={{
                      title: item.title,
                      city: item.city ?? fallbackCity ?? null,
                      country: item.country ?? fallbackCountry ?? null,
                      lat: item.latitude,
                      lng: item.longitude,
                      kind: item.kind,
                      rating: item.rating,
                      source: item.provider,
                      sourceUrl: item.source_url,
                    }}
                    compact
                    size="sm"
                    variant="ghost"
                    className="w-full rounded-xl"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      ) : (
        <Empty text="Aucun résultat vérifié disponible pour le moment. GlobeLink relancera automatiquement la recherche lors de la prochaine actualisation." />
      )}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}