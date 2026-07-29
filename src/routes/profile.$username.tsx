import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedMediaUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { getMockTraveler } from "@/lib/mock-home";
import { useAuth } from "@/lib/auth-context";
import { openOrCreateDirectConversation, toggleFollow } from "@/lib/social";
import {
  MapPin, MessageCircle, Users, Globe2, Play, Volume2, Sparkles, ArrowLeft, UserPlus, UserCheck, Share2,
  Pencil, Link as LinkIcon, BadgeCheck, Award, EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/$username")({
  ssr: false,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — GlobeLink` },
      { name: "description", content: `Profil voyageur de @${params.username} sur GlobeLink.` },
    ],
  }),
  errorComponent: ({ reset }) => (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-muted-foreground">Impossible de charger le profil pour le moment.</p>
        <Button onClick={reset} className="mt-4">Réessayer</Button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-md px-4 py-16 text-center text-muted-foreground">Profil introuvable.</div>
    </div>
  ),
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-page", username],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      return data;
    },
  });

  const { data: userBadges = [] } = useQuery({
    queryKey: ["profile-badges", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from("user_badges")
        .select("badge_id, badges(id, label, description, emoji)")
        .eq("user_id", profile!.id);
      return data ?? [];
    },
  });

  const { data: posts } = useQuery({
    queryKey: ["profile-posts", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase.from("posts").select("id, image_url").eq("user_id", profile!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => { getSignedMediaUrl(profile?.avatar_url).then(setAvatar); }, [profile?.avatar_url]);
  useEffect(() => { getSignedMediaUrl(profile?.banner_url).then(setBanner); }, [profile?.banner_url]);

  const mock = getMockTraveler(username);
  const targetId = profile?.id;
  const { data: isFollowing = false } = useQuery({
    queryKey: ["follow", user?.id, targetId],
    enabled: !!user && !!targetId && user?.id !== targetId,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("follower_id")
        .eq("follower_id", user!.id).eq("following_id", targetId!).maybeSingle();
      return !!data;
    },
  });

  if (isLoading && !mock) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">Chargement du profil…</div>
      </div>
    );
  }

  if (!profile && !mock) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Profil introuvable.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/">Retour au fil</Link></Button>
        </div>
      </div>
    );
  }

  if (profile && profile.visibility === "hidden" && user?.id !== profile.id) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><EyeOff className="h-6 w-6" /></div>
          <h1 className="mt-5 font-display text-3xl font-semibold">Profil non visible</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ce profil n'apparaît pas publiquement pour le moment.</p>
          <Button asChild variant="outline" className="mt-5 rounded-xl"><Link to="/">Retour au fil</Link></Button>
        </div>
      </div>
    );
  }

  const startConversation = async () => {
    if (!user) { toast.error("Connecte-toi pour envoyer un message"); return navigate({ to: "/auth" }); }
    try {
      let otherId = targetId;
      if (!otherId) {
        const { data, error } = await supabase.rpc("ensure_demo_profile", {
          _username: mock?.username ?? username,
          _display_name: mock?.displayName ?? username,
          _avatar_url: mock?.avatar ?? undefined,
        });
        if (error || !data) throw error ?? new Error("Profil indisponible");
        otherId = data as string;
      }
      if (otherId === user.id) { toast.info("C'est ton propre profil"); return; }
      const id = await openOrCreateDirectConversation(user.id, otherId);
      navigate({ to: "/messages/$id", params: { id } });
    } catch (e) { toast.error((e as Error).message || "Impossible d'ouvrir la conversation"); }
  };



  const onToggleFollow = async () => {
    if (!user) { toast.error("Connecte-toi pour suivre"); return navigate({ to: "/auth" }); }
    if (!targetId || targetId === user.id) return;
    try {
      await toggleFollow(user.id, targetId, isFollowing);
      qc.invalidateQueries({ queryKey: ["follow", user.id, targetId] });
      qc.invalidateQueries({ queryKey: ["profile-page", username] });
      toast.success(isFollowing ? "Abonnement retiré" : `Tu suis maintenant @${username}`);
    } catch { toast.error("Action impossible"); }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `@${username} sur GlobeLink`, url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Lien du profil copié");
  };

  // Real profile view (Supabase)
  if (profile && !mock) {
    const p = profile as typeof profile & {
      city?: string | null; travel_style?: string | null; interests?: string[] | null;
      website_url?: string | null; instagram?: string | null; tiktok?: string | null;
      youtube?: string | null; x_handle?: string | null; birth_date?: string | null;
    };
    const isMe = user?.id === profile.id;
    const socials = [
      p.website_url ? { label: "Site web", href: p.website_url } : null,
      p.instagram ? { label: `@${p.instagram}`, href: `https://instagram.com/${p.instagram}` } : null,
      p.tiktok ? { label: `TikTok @${p.tiktok}`, href: `https://tiktok.com/@${p.tiktok}` } : null,
      p.youtube ? { label: `YouTube @${p.youtube}`, href: `https://youtube.com/@${p.youtube}` } : null,
      p.x_handle ? { label: `X @${p.x_handle}`, href: `https://x.com/${p.x_handle}` } : null,
    ].filter(Boolean) as { label: string; href: string }[];
    const age = p.birth_date
      ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000)
      : null;
    const location = [p.city, profile.country].filter(Boolean).join(", ");

    return (
      <div className="min-h-screen bg-background pb-16">
        <AppHeader />
        <div className="relative">
          <div className="h-44 w-full overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-accent sm:h-60">
            {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="mx-auto max-w-5xl px-4">
            <div className="relative -mt-16 rounded-3xl border border-border bg-card p-6 shadow-elevated sm:p-8">
              <BackLink onClick={() => navigate({ to: "/" })} className="absolute left-4 top-4" />
              <div className="flex flex-col items-center gap-6 pt-8 sm:flex-row sm:items-end sm:pt-0">
                <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-4xl font-medium ring-4 ring-background">
                  {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : username[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h1 className="flex flex-wrap items-center justify-center gap-2 font-display text-3xl sm:justify-start">
                    <span>{profile.display_name ?? profile.username}</span>
                    {profile.verified && <span title="Profil vérifié" className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft"><BadgeCheck className="h-4 w-4" /></span>}
                    {age && age > 10 && age < 120 && <span className="text-lg font-normal text-muted-foreground">· {age} ans</span>}
                  </h1>
                  <p className="text-muted-foreground">@{profile.username}</p>
                  <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
                    {location && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {location}</span>}
                    {(profile.visited_countries?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1"><Globe2 className="h-4 w-4" /> {profile.visited_countries!.length} pays</span>
                    )}
                    <span>{posts?.length ?? 0} publications</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {profile.followers_count ?? 0} abonnés</span>
                    <span>{profile.following_count ?? 0} abonnements</span>
                  </p>
                  {p.travel_style && (
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
                      <Sparkles className="h-3.5 w-3.5" /> {p.travel_style}
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-52">
                  {isMe ? (
                    <Button asChild className="gap-2"><Link to="/settings/profile"><Pencil className="h-4 w-4" /> Modifier mon profil</Link></Button>
                  ) : (
                    <>
                      <Button onClick={startConversation} className="gap-2"><MessageCircle className="h-4 w-4" /> Message</Button>
                      {user && (
                        <Button onClick={onToggleFollow} variant={isFollowing ? "outline" : "default"} className="gap-2">
                          {isFollowing ? <><UserCheck className="h-4 w-4" /> Abonné</> : <><UserPlus className="h-4 w-4" /> Suivre</>}
                        </Button>
                      )}
                    </>
                  )}
                  <Button onClick={share} variant="outline" className="gap-2"><Share2 className="h-4 w-4" /> Partager</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-3">
          <aside className="space-y-6 lg:col-span-1">
            {userBadges.length > 0 && (
              <Card title="Badges" icon={<Award className="h-4 w-4" />}>
                <div className="grid gap-2">
                  {userBadges.map((entry: any) => {
                    const badge = entry.badges;
                    if (!badge) return null;
                    return <div key={entry.badge_id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/35 p-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-card text-lg shadow-sm">{badge.emoji}</span><span><span className="block text-xs font-semibold">{badge.label}</span><span className="block text-[10px] leading-snug text-muted-foreground">{badge.description}</span></span></div>;
                  })}
                </div>
              </Card>
            )}
            {profile.bio && <Card title="Biographie"><p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p></Card>}
            {(p.interests?.length ?? 0) > 0 && (
              <Card title="Centres d'intérêt">
                <div className="flex flex-wrap gap-2">
                  {p.interests!.map((i) => <span key={i} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{i}</span>)}
                </div>
              </Card>
            )}
            {(profile.languages?.length ?? 0) > 0 && (
              <Card title="Langues">
                <div className="flex flex-wrap gap-2">
                  {profile.languages!.map((l) => <span key={l} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">{l}</span>)}
                </div>
              </Card>
            )}
            {(profile.visited_countries?.length ?? 0) > 0 && (
              <Card title="Pays visités">
                <div className="flex flex-wrap gap-2">
                  {profile.visited_countries!.map((c) => <span key={c} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">{c}</span>)}
                </div>
              </Card>
            )}
            {socials.length > 0 && (
              <Card title="Réseaux" icon={<LinkIcon className="h-4 w-4" />}>
                <div className="flex flex-col gap-2">
                  {socials.map((s) => (
                    <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer"
                      className="truncate text-sm text-primary hover:underline">{s.label}</a>
                  ))}
                </div>
              </Card>
            )}
          </aside>

          <div className="lg:col-span-2">
            <Card title="Publications">
              {posts?.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {posts.map((post) => <ProfileTile key={post.id} id={post.id} path={post.image_url} />)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {isMe ? "Tu n'as pas encore publié. Partage ta première photo de voyage !" : "Aucune publication pour le moment."}
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Mock profile view (rich)
  const m = mock!;
  return (
    <div className="app-page">
      <AppHeader />

      {/* HERO */}
      <div className="relative">
        <div className="h-56 w-full bg-gradient-to-br from-primary via-primary/80 to-accent sm:h-72" />
        <div className="mx-auto max-w-5xl px-4">
          <div className="relative -mt-20 rounded-3xl border border-border bg-card p-6 shadow-elevated sm:p-8">
            <BackLink onClick={() => navigate({ to: "/" })} className="absolute left-4 top-4 sm:left-6 sm:top-6" />
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end">
              <img
                src={m.avatar}
                alt={m.displayName}
                className="h-32 w-32 shrink-0 rounded-full object-cover ring-4 ring-background shadow-elevated"
              />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="font-display text-3xl leading-tight sm:text-4xl">
                  {m.displayName}
                  <span className="ml-2 text-lg font-normal text-muted-foreground">· {m.age} ans</span>
                </h1>
                <p className="mt-1 text-muted-foreground">@{m.username}</p>
                <p className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" /> {m.city}</span>
                  <span className="inline-flex items-center gap-1"><Globe2 className="h-4 w-4" /> {m.countries} pays</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {m.followers.toLocaleString("fr-FR")} abonnés</span>
                </p>
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
                  <Sparkles className="h-3.5 w-3.5" /> {m.next}
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-56">
                <Button size="lg" onClick={startConversation} className="gap-2">
                  <MessageCircle className="h-4 w-4" /> Commencer une conversation
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => toast.success(`Tu suis maintenant @${m.username}`)}>
                    <UserPlus className="h-4 w-4" /> Suivre
                  </Button>
                  <Button variant="outline" size="icon" onClick={share} aria-label="Partager">
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-3">
        {/* LEFT COLUMN */}
        <aside className="space-y-6 lg:col-span-1">
          <Card title="Biographie">
            <p className="text-sm leading-relaxed text-muted-foreground">{m.bio}</p>
          </Card>

          <Card title="Personnalité">
            <div className="flex flex-wrap gap-2">
              {m.personality.map((p) => (
                <span key={p} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{p}</span>
              ))}
            </div>
          </Card>

          <Card title="Centres d'intérêt">
            <div className="flex flex-wrap gap-2">
              {m.interests.map((i) => (
                <span key={i} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs">{i}</span>
              ))}
            </div>
          </Card>

          <Card title="Voix" icon={<Volume2 className="h-4 w-4" />}>
            <p className="mb-2 text-xs text-muted-foreground">Écoute {m.displayName.split(" ")[0]} se présenter</p>
            <audio controls src={m.voice} className="w-full">
              Ton navigateur ne supporte pas la lecture audio.
            </audio>
          </Card>
        </aside>

        {/* RIGHT COLUMN */}
        <div className="space-y-6 lg:col-span-2">
          <Card title="Vidéos de voyage" icon={<Play className="h-4 w-4" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              {m.videos.map((src, idx) => (
                <div key={idx} className="group relative aspect-video overflow-hidden rounded-2xl">
                  <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent" />
                  <button
                    onClick={() => toast.info("Lecture des vidéos bientôt disponible")}
                    className="absolute inset-0 grid place-items-center"
                    aria-label="Lire la vidéo"
                  >
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-primary shadow-elevated transition group-hover:scale-110">
                      <Play className="h-6 w-6 fill-current" />
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Galerie">
            <div className="grid grid-cols-3 gap-2">
              {m.gallery.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt=""
                  className="aspect-square w-full cursor-pointer rounded-xl object-cover transition hover:scale-105 hover:shadow-soft"
                  onClick={() => toast.info("Visionneuse photo bientôt disponible")}
                />
              ))}
            </div>
          </Card>

          <div className="rounded-3xl border border-border bg-gradient-to-br from-primary to-accent p-6 text-primary-foreground shadow-elevated">
            <h3 className="font-display text-xl">Envie de partir avec {m.displayName.split(" ")[0]} ?</h3>
            <p className="mt-1 text-sm opacity-90">Envoie-lui un message et découvre son prochain itinéraire.</p>
            <Button variant="secondary" size="lg" className="mt-4 gap-2" onClick={startConversation}>
              <MessageCircle className="h-4 w-4" /> Commencer une conversation
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function BackLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full bg-background/80 px-3 py-1.5 text-sm text-foreground shadow-soft backdrop-blur transition hover:bg-background ${className ?? ""}`}
    >
      <ArrowLeft className="h-4 w-4" /> Retour
    </button>
  );
}

function ProfileTile({ id, path }: { id: string; path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getSignedMediaUrl(path).then(setUrl); }, [path]);
  return (
    <Link to="/post/$id" params={{ id }} className="aspect-square overflow-hidden rounded-2xl bg-muted">
      {url && <img src={url} alt="" className="h-full w-full object-cover transition hover:scale-105" />}
    </Link>
  );
}
