import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedMediaUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { ProfileActions } from "@/components/ProfileActions";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { openOrCreateDirectConversation, toggleFollow } from "@/lib/social";
import { guestCanOpenProfile } from "@/lib/guest-access";
import {
  MapPin,
  MessageCircle,
  Users,
  Globe2,
  ArrowLeft,
  UserPlus,
  UserCheck,
  Share2,
  Pencil,
  Link as LinkIcon,
  BadgeCheck,
  Award,
  EyeOff,
  LockKeyhole,
  Play,
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
  component: ProfilePage,
});

function ProfilePage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [guestAllowed, setGuestAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user) return setGuestAllowed(true);
    const allowed = guestCanOpenProfile(username);
    setGuestAllowed(allowed);
  }, [authLoading, user, username]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-page", username],
    enabled: guestAllowed === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: userBadges = [] } = useQuery({
    queryKey: ["profile-badges", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("badge_id, badges(id, label, description, emoji)")
        .eq("user_id", profile!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["profile-posts", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, image_url, video_url")
        .eq("user_id", profile!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    getSignedMediaUrl(profile?.avatar_url).then(setAvatar);
  }, [profile?.avatar_url]);
  useEffect(() => {
    getSignedMediaUrl(profile?.banner_url).then(setBanner);
  }, [profile?.banner_url]);

  const targetId = profile?.id;
  const { data: isFollowing = false } = useQuery({
    queryKey: ["follow", user?.id, targetId],
    enabled: !!user && !!targetId && user.id !== targetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user!.id)
        .eq("following_id", targetId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  const requireAccount = (message: string) => {
    toast.info(message);
    navigate({ to: "/auth", search: { redirect: `/profile/${username}` } });
  };

  const startConversation = async () => {
    if (!user) return requireAccount("Crée un compte pour envoyer un message.");
    if (!targetId || targetId === user.id) return;
    try {
      const id = await openOrCreateDirectConversation(user.id, targetId);
      navigate({ to: "/messages/$id", params: { id } });
    } catch (error) {
      toast.error((error as Error).message || "Impossible d'ouvrir la conversation");
    }
  };

  const onToggleFollow = async () => {
    if (!user) return requireAccount("Crée un compte pour suivre ce voyageur.");
    if (!targetId || targetId === user.id) return;
    try {
      await toggleFollow(user.id, targetId, isFollowing);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["follow", user.id, targetId] }),
        qc.invalidateQueries({ queryKey: ["profile-page", username] }),
        qc.invalidateQueries({ queryKey: ["my-follows", user.id] }),
        qc.invalidateQueries({ queryKey: ["stories"] }),
      ]);
      toast.success(isFollowing ? "Abonnement retiré" : `Tu suis maintenant @${username}`);
    } catch {
      toast.error("Action impossible");
    }
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `@${username} sur GlobeLink`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Lien du profil copié");
  };

  if (guestAllowed === false) {
    return (
      <div className="app-page">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold">
            Rejoins GlobeLink pour continuer
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Tu peux découvrir un profil sans compte. Pour consulter d'autres voyageurs, liker,
            commenter ou envoyer un message, crée ton compte vérifié.
          </p>
          <Button
            onClick={() => navigate({ to: "/auth", search: { redirect: `/profile/${username}` } })}
            className="mt-6 h-12 w-full rounded-2xl"
          >
            Créer mon compte
          </Button>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link to="/">Retour au fil</Link>
          </Button>
        </main>
      </div>
    );
  }

  if (guestAllowed === null || isLoading) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
          Chargement du profil…
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-muted-foreground">Profil introuvable.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">Retour au fil</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (profile.visibility === "hidden" && user?.id !== profile.id) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <EyeOff className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-semibold">Profil non visible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ce profil n'apparaît pas publiquement pour le moment.
          </p>
          <Button asChild variant="outline" className="mt-5 rounded-xl">
            <Link to="/">Retour au fil</Link>
          </Button>
        </div>
      </div>
    );
  }

  const p = profile as typeof profile & {
    city?: string | null;
    travel_style?: string | null;
    interests?: string[] | null;
    website_url?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    x_handle?: string | null;
    birth_date?: string | null;
  };
  const isMe = user?.id === profile.id;
  const socials = [
    p.website_url ? { label: "Site web", href: p.website_url } : null,
    p.instagram
      ? { label: `Instagram @${p.instagram}`, href: `https://instagram.com/${p.instagram}` }
      : null,
    p.tiktok ? { label: `TikTok @${p.tiktok}`, href: `https://tiktok.com/@${p.tiktok}` } : null,
    p.youtube
      ? { label: `YouTube @${p.youtube}`, href: `https://youtube.com/@${p.youtube}` }
      : null,
    p.x_handle ? { label: `X @${p.x_handle}`, href: `https://x.com/${p.x_handle}` } : null,
  ].filter(Boolean) as { label: string; href: string }[];
  const age = p.birth_date
    ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31557600000)
    : null;
  const location = [p.city, profile.country].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-10">
      <AppHeader />
      <div className="relative">
        <div
          className={`profile-banner w-full overflow-hidden bg-slate-900 transition-[height] ${
            banner ? "h-36 sm:h-56" : "h-16 sm:h-28"
          }`}
        >
          {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="mx-auto max-w-5xl px-3 sm:px-4">
          <div className="relative -mt-10 rounded-[1.5rem] border border-border bg-card p-4 shadow-elevated sm:-mt-16 sm:rounded-3xl sm:p-7">
            <BackLink
              onClick={() => navigate({ to: "/" })}
              className="absolute left-3 top-3 sm:left-5 sm:top-5"
            />
            <div className="absolute right-3 top-3 sm:right-5 sm:top-5">
              <ProfileActions
                currentUserId={user?.id}
                targetUserId={profile.id}
                username={profile.username}
              />
            </div>
            <div className="flex flex-col items-center gap-4 pt-10 sm:flex-row sm:items-end sm:gap-6 sm:pt-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-3xl font-medium ring-4 ring-background sm:h-28 sm:w-28">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  username[0]?.toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h1 className="flex flex-wrap items-center justify-center gap-2 font-display text-2xl font-semibold sm:justify-start sm:text-3xl">
                  <span className="break-words">{profile.display_name ?? profile.username}</span>
                  {profile.verified && <BadgeCheck className="h-6 w-6 text-primary" />}
                  {age && age > 10 && age < 120 && (
                    <span className="text-base font-normal text-muted-foreground">· {age} ans</span>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:justify-start sm:text-sm">
                  {location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-4 w-4" /> {location}
                    </span>
                  )}
                  <span>{posts.length} publications</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-4 w-4" /> {profile.followers_count ?? 0} abonnés
                  </span>
                  <span>{profile.following_count ?? 0} abonnements</span>
                </div>
                {p.travel_style && (
                  <p className="mt-3 inline-flex rounded-full bg-secondary px-3 py-1 text-sm text-foreground">
                    {p.travel_style}
                  </p>
                )}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-52 sm:flex-col">
                {isMe ? (
                  <Button asChild className="col-span-2 gap-2">
                    <Link to="/settings/profile">
                      <Pencil className="h-4 w-4" /> Modifier mon profil
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button onClick={startConversation} className="gap-2">
                      <MessageCircle className="h-4 w-4" /> Message
                    </Button>
                    <Button
                      onClick={onToggleFollow}
                      variant={isFollowing ? "outline" : "default"}
                      className="gap-2"
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="h-4 w-4" /> Abonné
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" /> Suivre
                        </>
                      )}
                    </Button>
                  </>
                )}
                <Button onClick={share} variant="outline" className="col-span-2 gap-2">
                  <Share2 className="h-4 w-4" /> Partager
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 px-3 py-5 sm:px-4 sm:py-8 lg:grid-cols-3 lg:gap-6">
        <aside className="space-y-4 lg:col-span-1">
          {userBadges.length > 0 && (
            <Card title="Badges" icon={<Award className="h-4 w-4" />}>
              <div className="grid gap-2">
                {userBadges.map((entry: any) =>
                  entry.badges ? (
                    <div
                      key={entry.badge_id}
                      className="flex items-center gap-3 rounded-xl bg-secondary/60 p-2.5"
                    >
                      <span className="text-lg">{entry.badges.emoji}</span>
                      <span>
                        <span className="block text-xs font-semibold">{entry.badges.label}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {entry.badges.description}
                        </span>
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
            </Card>
          )}
          {profile.bio && (
            <Card title="Biographie">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {profile.bio}
              </p>
            </Card>
          )}
          {(p.interests?.length ?? 0) > 0 && (
            <Card title="Centres d'intérêt">
              <div className="flex flex-wrap gap-2">
                {p.interests!.map((item) => (
                  <span key={item} className="rounded-full bg-secondary px-3 py-1 text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {(profile.languages?.length ?? 0) > 0 && (
            <Card title="Langues">
              <div className="flex flex-wrap gap-2">
                {profile.languages!.map((item) => (
                  <span key={item} className="rounded-full border border-border px-3 py-1 text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {(profile.visited_countries?.length ?? 0) > 0 && (
            <Card title="Pays visités">
              <div className="flex flex-wrap gap-2">
                {profile.visited_countries!.map((item) => (
                  <span key={item} className="rounded-full border border-border px-3 py-1 text-xs">
                    {item}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {socials.length > 0 && (
            <Card title="Réseaux" icon={<LinkIcon className="h-4 w-4" />}>
              <div className="flex flex-col gap-2">
                {socials.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm text-primary hover:underline"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </Card>
          )}
        </aside>
        <div className="lg:col-span-2">
          <Card title="Publications">
            {posts.length ? (
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {posts.map((post) => (
                  <ProfileTile
                    key={post.id}
                    id={post.id}
                    path={post.image_url}
                    isVideo={!!post.video_url}
                  />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {isMe ? "Tu n'as pas encore publié." : "Aucune publication pour le moment."}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
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
      className={`inline-flex items-center gap-1 rounded-full bg-background/90 px-3 py-1.5 text-sm shadow-soft backdrop-blur ${className ?? ""}`}
    >
      <ArrowLeft className="h-4 w-4" /> Retour
    </button>
  );
}
function ProfileTile({ id, path, isVideo }: { id: string; path: string; isVideo: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getSignedMediaUrl(path).then(setUrl);
  }, [path]);
  return (
    <Link
      to="/post/$id"
      params={{ id }}
      className="group relative aspect-square overflow-hidden rounded-md bg-muted sm:rounded-xl"
    >
      {url && (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      )}
      {isVideo && (
        <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white shadow-soft backdrop-blur">
          <Play className="h-4 w-4 fill-current" />
        </span>
      )}
    </Link>
  );
}
