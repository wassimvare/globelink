import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  Clock3,
  Compass,
  Heart,
  History,
  Images,
  Loader2,
  MessageCircle,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getSignedMediaUrl } from "@/lib/storage";
import {
  clearActivitySection,
  deleteAllOwnedPosts,
  deleteOwnComment,
  deleteOwnedPost,
  deleteOwnedStories,
  deleteOwnedStory,
  loadActivityData,
  removeMatchLike,
  removeMatchPass,
  removePostLike,
  removePostReaction,
  removeSavedPost,
  removeSearchHistoryItem,
  type ActivityClearSection,
  type ActivityPost,
  type ActivityProfile,
} from "@/lib/activity";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Votre activité — GlobeLink" },
      {
        name: "description",
        content: "Retrouvez et gérez vos interactions, contenus, recherches, voyages et choix Travel Match.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivityPage,
});

type Tab = "overview" | "interactions" | "saved" | "content" | "match" | "travel" | "searches";

const tabs: Array<{ id: Tab; label: string; icon: typeof History }> = [
  { id: "overview", label: "Aperçu", icon: History },
  { id: "interactions", label: "Interactions", icon: Heart },
  { id: "saved", label: "Enregistrés", icon: Bookmark },
  { id: "content", label: "Votre contenu", icon: Images },
  { id: "match", label: "Travel Match", icon: Sparkles },
  { id: "travel", label: "Voyages", icon: Compass },
  { id: "searches", label: "Recherches", icon: Search },
];

function ActivityPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);

  const activity = useQuery({
    queryKey: ["my-activity", user?.id],
    enabled: !!user,
    queryFn: () => loadActivityData(user!.id),
    staleTime: 15_000,
  });

  const data = activity.data;
  const counts = useMemo(
    () => ({
      interactions:
        (data?.likes.length ?? 0) +
        (data?.reactions.length ?? 0) +
        (data?.comments.length ?? 0) +
        (data?.storyLikes.length ?? 0),
      saved: data?.saves.length ?? 0,
      content: (data?.posts.length ?? 0) + (data?.stories.length ?? 0),
      match: (data?.matchLikes.length ?? 0) + (data?.matchPasses.length ?? 0),
      travel: (data?.trips.length ?? 0) + (data?.travelIntents.length ?? 0),
      searches: data?.searches.length ?? 0,
    }),
    [data],
  );

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["my-activity", user?.id] }),
      qc.invalidateQueries({ queryKey: ["feed"] }),
      qc.invalidateQueries({ queryKey: ["stories"] }),
      qc.invalidateQueries({ queryKey: ["profile-posts", user?.id] }),
      qc.invalidateQueries({ queryKey: ["match-real-candidates"] }),
      qc.invalidateQueries({ queryKey: ["match-exclusions", user?.id] }),
    ]);
  }

  async function run(key: string, work: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      await refresh();
      toast.success(success);
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setBusy(null);
    }
  }

  async function clearSection(section: ActivityClearSection, label: string, success: string) {
    if (!user || busy) return;
    if (!window.confirm(label)) return;
    await run(`clear-${section}`, () => clearActivitySection(user.id, section), success);
  }

  if (activity.isLoading || !data) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement de votre activité…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-9">
        <div className="mb-5 flex items-center gap-3">
          <BackButton compact />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Paramètres</p>
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">Votre activité</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Retrouvez ce que vous avez aimé, enregistré, recherché, publié et choisi sur GlobeLink.
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                  tab === item.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </button>
            );
          })}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <OverviewCard icon={Heart} title="Interactions" count={counts.interactions} text="J’aime, réactions et commentaires" onClick={() => setTab("interactions")} />
              <OverviewCard icon={Bookmark} title="Enregistrés" count={counts.saved} text="Publications gardées pour plus tard" onClick={() => setTab("saved")} />
              <OverviewCard icon={Images} title="Votre contenu" count={counts.content} text="Publications et stories" onClick={() => setTab("content")} />
              <OverviewCard icon={Sparkles} title="Travel Match" count={counts.match} text="Likes et profils passés" onClick={() => setTab("match")} />
              <OverviewCard icon={Compass} title="Voyages" count={counts.travel} text="Carnets et intentions de voyage" onClick={() => setTab("travel")} />
              <OverviewCard icon={Search} title="Recherches" count={counts.searches} text="Historique synchronisé sur votre compte" onClick={() => setTab("searches")} />
            </section>

            <section className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl">Résumé du compte</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Les compteurs ci-dessus viennent directement de vos données GlobeLink, pas d’un historique local au téléphone.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric label="Publications" value={data.posts.length} />
                <Metric label="Stories" value={data.stories.length} />
                <Metric label="Carnets de voyage" value={data.trips.length} />
              </div>
            </section>
          </div>
        )}

        {tab === "interactions" && (
          <div className="space-y-6">
            <ActivitySection
              title={`J’aime et réactions (${data.likes.length + data.reactions.length + data.storyLikes.length})`}
              description="Retirez une interaction individuellement ou nettoyez tout l’historique de réactions."
              action={
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void clearSection("likes", "Retirer tous vos J’aime et réactions ?", "Interactions effacées")}
                  className="rounded-xl"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Tout retirer
                </Button>
              }
            >
              {data.likes.map((item) => {
                const post = data.referencedPosts[item.post_id];
                return (
                  <PostActivityRow
                    key={`like-${item.post_id}`}
                    post={post}
                    date={item.created_at}
                    label="Publication aimée"
                    profile={post ? data.profiles[post.user_id] : undefined}
                    busy={busy === `like-${item.post_id}`}
                    onRemove={() => user && run(`like-${item.post_id}`, () => removePostLike(user.id, item.post_id), "J’aime retiré")}
                  />
                );
              })}
              {data.reactions.map((item) => {
                const post = data.referencedPosts[item.post_id];
                return (
                  <PostActivityRow
                    key={`reaction-${item.id}`}
                    post={post}
                    date={item.created_at}
                    label={`Réaction ${reactionEmoji(item.reaction)}`}
                    profile={post ? data.profiles[post.user_id] : undefined}
                    busy={busy === `reaction-${item.id}`}
                    onRemove={() => user && run(`reaction-${item.id}`, () => removePostReaction(user.id, item.id), "Réaction retirée")}
                  />
                );
              })}
              {data.likes.length === 0 && data.reactions.length === 0 && data.storyLikes.length === 0 && <Empty text="Aucune interaction enregistrée." />}
              {data.storyLikes.length > 0 && (
                <p className="rounded-2xl bg-secondary/60 p-3 text-xs text-muted-foreground">
                  {data.storyLikes.length} J’aime de story sont également inclus dans le nettoyage global. Les stories expirées ne sont pas réaffichées ici.
                </p>
              )}
            </ActivitySection>

            <ActivitySection
              title={`Commentaires (${data.comments.length})`}
              description="Historique des commentaires publiés avec suppression individuelle ou globale."
              action={
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => void clearSection("comments", "Supprimer tous vos commentaires ? Cette action est définitive.", "Commentaires supprimés")}
                  className="rounded-xl"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Tout supprimer
                </Button>
              }
            >
              {data.comments.map((comment) => {
                const post = data.referencedPosts[comment.post_id];
                return (
                  <div key={comment.id} className="flex items-start gap-3 rounded-2xl border border-border/70 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{comment.content}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(comment.created_at)}</p>
                      {post && (
                        <Link to="/post/$id" params={{ id: post.id }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          Voir la publication <ChevronRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <IconDeleteButton
                      busy={busy === `comment-${comment.id}`}
                      label="Supprimer le commentaire"
                      onClick={() => user && run(`comment-${comment.id}`, () => deleteOwnComment(user.id, comment.id), "Commentaire supprimé")}
                    />
                  </div>
                );
              })}
              {data.comments.length === 0 && <Empty text="Vous n’avez publié aucun commentaire." />}
            </ActivitySection>
          </div>
        )}

        {tab === "saved" && (
          <ActivitySection
            title={`Publications enregistrées (${data.saves.length})`}
            description="Retrouvez vos favoris ou retirez-les de votre collection."
            action={
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => void clearSection("saved", "Retirer toutes les publications enregistrées ?", "Favoris nettoyés")}
                className="rounded-xl"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Tout retirer
              </Button>
            }
          >
            {data.saves.map((save) => {
              const post = data.referencedPosts[save.post_id];
              return (
                <PostActivityRow
                  key={save.post_id}
                  post={post}
                  date={save.created_at}
                  label="Enregistrée"
                  profile={post ? data.profiles[post.user_id] : undefined}
                  busy={busy === `save-${save.post_id}`}
                  onRemove={() => user && run(`save-${save.post_id}`, () => removeSavedPost(user.id, save.post_id), "Retiré des favoris")}
                />
              );
            })}
            {data.saves.length === 0 && <Empty text="Aucune publication enregistrée." />}
          </ActivitySection>
        )}

        {tab === "content" && (
          <div className="space-y-6">
            <ActivitySection
              title={`Vos publications (${data.posts.length})`}
              description="Gérez les publications de votre profil. La suppression nettoie aussi les médias GlobeLink associés."
              action={
                <Button
                  variant="outline"
                  disabled={!!busy || data.posts.length === 0}
                  onClick={() => {
                    if (!user || !window.confirm("Supprimer TOUTES vos publications ? Cette action est définitive.")) return;
                    void run("all-posts", () => deleteAllOwnedPosts(user.id), "Toutes vos publications ont été supprimées");
                  }}
                  className="rounded-xl text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Tout supprimer
                </Button>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {data.posts.map((post) => (
                  <ContentCard
                    key={post.id}
                    post={post}
                    busy={busy === `post-${post.id}`}
                    onDelete={() => {
                      if (!user || !window.confirm("Supprimer cette publication ?")) return;
                      void run(`post-${post.id}`, () => deleteOwnedPost(user.id, post.id), "Publication supprimée");
                    }}
                  />
                ))}
              </div>
              {data.posts.length === 0 && <Empty text="Vous n’avez encore publié aucun contenu." />}
            </ActivitySection>

            <ActivitySection
              title={`Vos stories (${data.stories.length})`}
              description="Les stories expirées restent visibles ici pour que vous puissiez réellement les nettoyer."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => user && run("expired-stories", () => deleteOwnedStories(user.id, true), "Stories expirées nettoyées")}
                    className="rounded-xl"
                  >
                    Nettoyer les expirées
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy || data.stories.length === 0}
                    onClick={() => {
                      if (!user || !window.confirm("Supprimer TOUTES vos stories, y compris les stories encore actives ?")) return;
                      void run("all-stories", () => deleteOwnedStories(user.id, false), "Toutes les stories ont été supprimées");
                    }}
                    className="rounded-xl text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Tout supprimer
                  </Button>
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.stories.map((story) => (
                  <div key={story.id} className="rounded-2xl border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{story.media_type === "video" ? "Story vidéo" : "Story photo"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(story.created_at)}</p>
                        <p className={`mt-2 text-xs font-semibold ${new Date(story.expires_at) < new Date() ? "text-muted-foreground" : "text-emerald-600"}`}>
                          {new Date(story.expires_at) < new Date() ? "Expirée" : "Active"} · {story.audience === "close_friends" ? "Amis proches" : "Abonnés"}
                        </p>
                      </div>
                      <IconDeleteButton
                        busy={busy === `story-${story.id}`}
                        label="Supprimer la story"
                        onClick={() => {
                          if (!user || !window.confirm("Supprimer cette story ?")) return;
                          void run(`story-${story.id}`, () => deleteOwnedStory(user.id, story.id), "Story supprimée");
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {data.stories.length === 0 && <Empty text="Aucune story dans votre historique." />}
            </ActivitySection>
          </div>
        )}

        {tab === "match" && (
          <ActivitySection
            title="Activité Travel Match"
            description="Retrouvez les profils aimés ou passés. Réinitialiser vos choix ne supprime pas vos conversations existantes."
            action={
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => void clearSection("travel_match", "Réinitialiser tous vos likes et profils passés Travel Match ? Les conversations existantes resteront intactes.", "Choix Travel Match réinitialisés")}
                className="rounded-xl"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser mes choix
              </Button>
            }
          >
            {data.matchLikes.map((item) => (
              <ProfileActivityRow
                key={`match-like-${item.id}`}
                profile={data.profiles[item.to_user_id]}
                date={item.created_at}
                label="Profil aimé"
                busy={busy === `match-like-${item.id}`}
                onRemove={() => user && run(`match-like-${item.id}`, () => removeMatchLike(user.id, item.id), "Like Travel Match retiré")}
              />
            ))}
            {data.matchPasses.map((item) => (
              <ProfileActivityRow
                key={`match-pass-${item.id}`}
                profile={data.profiles[item.target_id]}
                date={item.created_at}
                label="Profil passé"
                busy={busy === `match-pass-${item.id}`}
                onRemove={() => user && run(`match-pass-${item.id}`, () => removeMatchPass(user.id, item.id), "Profil réintégré aux suggestions")}
              />
            ))}
            {data.matchLikes.length === 0 && data.matchPasses.length === 0 && <Empty text="Aucun choix Travel Match enregistré." />}
          </ActivitySection>
        )}

        {tab === "travel" && (
          <div className="space-y-6">
            <ActivitySection title={`Carnets de voyage (${data.trips.length})`} description="Vos voyages créés dans GlobeLink.">
              {data.trips.map((trip) => (
                <Link
                  key={trip.id}
                  to="/trips/$id"
                  params={{ id: trip.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 p-3 transition hover:border-primary/30 hover:bg-secondary/30"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Compass className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{trip.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{[trip.city, trip.country].filter(Boolean).join(", ") || "Voyage"} · {trip.status || "en cours"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
              {data.trips.length === 0 && <Empty text="Aucun carnet de voyage." />}
            </ActivitySection>

            <ActivitySection title={`Intentions de voyage (${data.travelIntents.length})`} description="Les destinations utilisées pour Travel Match et les recommandations intelligentes.">
              {data.travelIntents.map((intent) => (
                <div key={intent.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-secondary"><CalendarDays className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{[intent.destination_city, intent.destination_country].filter(Boolean).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">{formatShortDate(intent.starts_on)} → {formatShortDate(intent.ends_on)} · {intent.visibility === "public" ? "Public" : "Privé"}</p>
                  </div>
                  <Link to="/match" className="text-xs font-semibold text-primary">Travel Match</Link>
                </div>
              ))}
              {data.travelIntents.length === 0 && <Empty text="Aucune intention de voyage enregistrée." />}
            </ActivitySection>
          </div>
        )}

        {tab === "searches" && (
          <ActivitySection
            title={`Historique de recherche (${data.searches.length})`}
            description="Cet historique est désormais synchronisé avec votre compte. GlobeLink conserve les 100 recherches récentes au maximum."
            action={
              <Button
                variant="outline"
                disabled={!!busy || data.searches.length === 0}
                onClick={() => void clearSection("searches", "Effacer tout votre historique de recherche GlobeLink ?", "Historique de recherche effacé")}
                className="rounded-xl"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Tout effacer
              </Button>
            }
          >
            {data.searches.map((search) => (
              <div key={search.id} className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary"><Search className="h-4 w-4" /></div>
                <button type="button" onClick={() => window.location.assign(`/search?q=${encodeURIComponent(search.query)}`)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold">{search.query}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(search.last_searched_at)} · {search.search_count} recherche{search.search_count > 1 ? "s" : ""}</p>
                </button>
                <IconDeleteButton
                  busy={busy === `search-${search.id}`}
                  label="Retirer de l'historique"
                  onClick={() => user && run(`search-${search.id}`, () => removeSearchHistoryItem(user.id, search.id), "Recherche retirée")}
                />
              </div>
            ))}
            {data.searches.length === 0 && <Empty text="Votre historique de recherche est vide." />}
          </ActivitySection>
        )}
      </main>
    </div>
  );
}

function OverviewCard({ icon: Icon, title, count, text, onClick }: { icon: typeof History; title: string; count: number; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-3xl border border-border bg-card p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">{count}</span></div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
        </div>
      </div>
    </button>
  );
}

function ActivitySection({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="font-display text-xl">{title}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p></div>
        {action}
      </div>
      <div className="mt-5 space-y-2">{children}</div>
    </section>
  );
}

function PostActivityRow({ post, profile, date, label, busy, onRemove }: { post?: ActivityPost; profile?: ActivityProfile; date: string; label: string; busy: boolean; onRemove: () => void }) {
  if (!post) return <div className="rounded-2xl border border-border/70 p-3 text-xs text-muted-foreground">Cette publication n’est plus disponible.</div>;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
      <ActivityThumbnail path={post.image_url} />
      <Link to="/post/$id" params={{ id: post.id }} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{post.caption || "Publication"}</p>
        <p className="truncate text-xs text-muted-foreground">{label} · {profile?.display_name || (profile?.username ? `@${profile.username}` : "GlobeLink")} · {formatDate(date)}</p>
      </Link>
      <IconDeleteButton busy={busy} label="Retirer" onClick={onRemove} />
    </div>
  );
}

function ProfileActivityRow({ profile, date, label, busy, onRemove }: { profile?: ActivityProfile; date: string; label: string; busy: boolean; onRemove: () => void }) {
  const content = (
    <>
      <Avatar profile={profile} />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{profile?.display_name || (profile?.username ? `@${profile.username}` : "Profil indisponible")}</p><p className="text-xs text-muted-foreground">{label} · {formatDate(date)}</p></div>
    </>
  );
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 p-3">
      {profile?.username ? <Link to="/profile/$username" params={{ username: profile.username }} className="contents">{content}</Link> : content}
      <IconDeleteButton busy={busy} label="Annuler ce choix" onClick={onRemove} />
    </div>
  );
}

function ContentCard({ post, busy, onDelete }: { post: ActivityPost; busy: boolean; onDelete: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70">
      <Link to="/post/$id" params={{ id: post.id }}><div className="aspect-[16/9] bg-secondary"><ActivityMedia path={post.image_url} className="h-full w-full object-cover" /></div></Link>
      <div className="flex items-start gap-3 p-3"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold">{post.caption || "Publication sans légende"}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(post.created_at)}{post.city || post.country ? ` · ${[post.city, post.country].filter(Boolean).join(", ")}` : ""}</p></div><IconDeleteButton busy={busy} label="Supprimer" onClick={onDelete} /></div>
    </div>
  );
}

function ActivityThumbnail({ path }: { path: string | null }) {
  return <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-secondary"><ActivityMedia path={path} className="h-full w-full object-cover" /></div>;
}

function ActivityMedia({ path, className }: { path: string | null; className: string }) {
  const { data: url } = useQuery({ queryKey: ["activity-media", path], queryFn: () => getSignedMediaUrl(path), enabled: !!path, staleTime: 60 * 60_000 });
  if (!url) return <div className={`${className} bg-secondary`} />;
  return <img src={url} alt="" loading="lazy" decoding="async" className={className} />;
}

function Avatar({ profile }: { profile?: ActivityProfile }) {
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-semibold">
      {profile?.avatar_url ? <ActivityMedia path={profile.avatar_url} className="h-full w-full object-cover" /> : (profile?.username?.[0] || "?").toUpperCase()}
    </div>
  );
}

function IconDeleteButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={busy} onClick={onClick} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-secondary/60 p-4"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatShortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  } catch {
    return value;
  }
}

function reactionEmoji(reaction: string) {
  return ({ love: "❤️", wow: "😮", haha: "😂", fire: "🔥", wanderlust: "🌍", sad: "😢" } as Record<string, string>)[reaction] || reaction;
}
