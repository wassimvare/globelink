import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Heart, MapPin, MessageCircle, Bookmark, Share2, ChevronLeft, ChevronRight, SmilePlus, Volume2, VolumeX, Play, UserPlus, Check, MoreHorizontal, EyeOff, Undo2 } from "lucide-react";
import { REACTIONS, setReaction, toggleFollow, type ReactionKey } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSignedMediaUrl } from "@/lib/storage";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Media = { id: string; url: string; media_type: string; position: number };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
type Post = {
  id: string;
  user_id: string;
  caption: string | null;
  image_url: string;
  country: string | null;
  city: string | null;
  activity?: string | null;
  hashtags?: string[] | null;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
  post_likes: { user_id: string }[];
  comments: { count: number }[];
  post_media?: Media[];
};

function useSigned(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { getSignedMediaUrl(path).then(setUrl); }, [path]);
  return url;
}

export function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const [hidden, setHidden] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const media: Media[] = post.post_media?.length
    ? [...post.post_media].sort((a, b) => a.position - b.position)
    : [{ id: "cover", url: post.image_url, media_type: "image", position: 0 }];

  const current = media[Math.min(idx, media.length - 1)];
  const imgUrl = useSigned(current.url);
  const avatarUrl = useSigned(post.profiles?.avatar_url);
  const isReel = current.media_type === "reel";
  const isVideo = current.media_type === "video" || isReel;
  const isMockPost = !isUuid(post.user_id);
  const isSelf = user?.id === post.user_id;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45 && isReel) {
        video.play().catch(() => undefined);
      } else if (!entry.isIntersecting || entry.intersectionRatio < 0.2) {
        video.pause();
      }
    }, { threshold: [0, 0.2, 0.45, 0.8] });
    observer.observe(video);
    return () => observer.disconnect();
  }, [isVideo, isReel, imgUrl]);

  const liked = !!user && post.post_likes.some((l) => l.user_id === user.id);
  const likeCount = post.post_likes.length;
  const commentCount = post.comments[0]?.count ?? 0;

  const { data: myReaction } = useQuery({
    queryKey: ["post-reaction", post.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("post_reactions").select("reaction").eq("post_id", post.id).eq("user_id", user!.id).maybeSingle();
      return (data?.reaction ?? null) as ReactionKey | null;
    },
  });

  const applyReaction = useMutation({
    mutationFn: async (r: ReactionKey | null) => {
      if (!user) throw new Error("auth");
      await setReaction(post.id, user.id, r);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-reaction", post.id, user?.id] }),
    onError: (e: Error) => { if (e.message === "auth") toast.error("Connecte-toi pour réagir"); },
  });

  const { data: saved } = useQuery({
    queryKey: ["post-saved", post.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("post_saves").select("post_id").eq("post_id", post.id).eq("user_id", user!.id).maybeSingle();
      return !!data;
    },
  });

  const [mockLiked, setMockLiked] = useState(false);
  const [mockSaved, setMockSaved] = useState(false);

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (isMockPost) { setMockLiked((v) => !v); return; }
      if (liked) await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      else await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
    },
    onSuccess: () => { if (!isMockPost) qc.invalidateQueries({ queryKey: ["feed"] }); },
    onError: (e: Error) => { if (e.message === "auth") toast.error("Connecte-toi pour aimer"); },
  });

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (isMockPost) { setMockSaved((v) => !v); return; }
      if (saved) await supabase.from("post_saves").delete().eq("post_id", post.id).eq("user_id", user.id);
      else await supabase.from("post_saves").insert({ post_id: post.id, user_id: user.id });
    },
    onSuccess: () => {
      if (!isMockPost) qc.invalidateQueries({ queryKey: ["post-saved", post.id] });
      toast.success((isMockPost ? mockSaved : saved) ? "Retiré des favoris" : "Ajouté aux favoris");
    },
    onError: (e: Error) => { if (e.message === "auth") toast.error("Connecte-toi pour enregistrer"); },
  });

  const share = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/post/${post.id}` : "";
    try {
      if (navigator.share) await navigator.share({ title: "GlobeLink", text: post.caption ?? "", url });
      else { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
    } catch { /* cancelled */ }
  };

  const username = post.profiles?.username ?? "voyageur";
  const displayName = post.profiles?.display_name ?? username;

  // Follow state (real users only)
  const { data: isFollowing } = useQuery({
    queryKey: ["follow-card", user?.id, post.user_id],
    enabled: !!user && !isSelf && !isMockPost,
    queryFn: async () => {
      const { data } = await supabase.from("follows").select("follower_id")
        .eq("follower_id", user!.id).eq("following_id", post.user_id).maybeSingle();
      return !!data;
    },
  });
  const [mockFollowed, setMockFollowed] = useState(false);
  const followed = isMockPost ? mockFollowed : !!isFollowing;

  const doFollow = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      if (isMockPost) { setMockFollowed((v) => !v); return; }
      await toggleFollow(user.id, post.user_id, !!isFollowing);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follow-card", user?.id, post.user_id] });
      toast.success(followed ? `Tu ne suis plus @${username}` : `Tu suis @${username} ✨`);
    },
    onError: (e: Error) => { if (e.message === "auth") toast.error("Connecte-toi pour suivre"); },
  });

  if (hidden) {
    return (
      <div className="surface-subtle flex items-center justify-between gap-4 rounded-3xl p-5 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><EyeOff className="h-4 w-4" /> Publication masquée de ton fil.</span>
        <button type="button" onClick={() => setHidden(false)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 font-semibold text-foreground transition hover:shadow-soft"><Undo2 className="h-3.5 w-3.5" /> Annuler</button>
      </div>
    );
  }

  return (
    <article className="group surface-card interactive-card media-polish animate-rise overflow-hidden rounded-[1.75rem]">
      <header className="flex items-center gap-3 p-4">
        <Link to="/profile/$username" params={{ username }} className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-secondary shrink-0 ring-2 ring-transparent transition hover:ring-accent">
          {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="text-sm font-medium">{username[0]?.toUpperCase()}</span>}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link to="/profile/$username" params={{ username }} className="min-w-0 truncate text-sm font-semibold hover:underline">{displayName}</Link>
            {!isSelf && (
              <button
                onClick={() => doFollow.mutate()}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${followed ? "bg-secondary text-muted-foreground" : "gradient-hero text-primary-foreground shadow-soft"}`}
              >
                {followed ? (<span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Suivi</span>) : (<span className="inline-flex items-center gap-1"><UserPlus className="h-3 w-3" /> Suivre</span>)}
              </button>
            )}
          </div>
          {(post.country || post.city) && (
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {[post.city, post.country].filter(Boolean).join(", ")}
              {post.activity && <span className="ml-1 truncate">· {post.activity}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ClientTime iso={post.created_at} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Options de la publication" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"><MoreHorizontal className="h-5 w-5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl border-border/70 bg-card/95 p-2 shadow-elevated backdrop-blur-2xl">
              <DropdownMenuItem onClick={() => setHidden(true)} className="rounded-xl"><EyeOff className="mr-2 h-4 w-4" /> Ne plus voir</DropdownMenuItem>
              <DropdownMenuItem onClick={share} className="rounded-xl"><Share2 className="mr-2 h-4 w-4" /> Partager le lien</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>



      <div className={`relative overflow-hidden bg-muted ${isReel ? "aspect-[9/16] max-h-[80vh] mx-auto w-full" : "aspect-square"}`}>
        {(() => {
          const inner = imgUrl ? (
            isVideo ? (
              <video
                ref={videoRef}
                src={imgUrl}
                autoPlay={isReel}
                muted={muted}
                loop={isReel}
                playsInline
                controls={!isReel}
                className="h-full w-full object-cover"
              />
            ) : (
              <img src={imgUrl} alt={post.caption ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.025]" />
            )
          ) : (
            <div className="skeleton h-full w-full" />
          );
          return isMockPost ? (
            <div className="block h-full w-full overflow-hidden">{inner}</div>
          ) : (
            <Link to="/post/$id" params={{ id: post.id }} className="block h-full w-full overflow-hidden">{inner}</Link>
          );
        })()}

        {isReel && (
          <>
            <span className="absolute left-3 top-3 rounded-full glass px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
              <Play className="mr-1 inline h-3 w-3 fill-white" /> Reel
            </span>
            <button
              onClick={(e) => { e.preventDefault(); setMuted((m) => !m); }}
              className="absolute right-3 bottom-3 grid h-10 w-10 place-items-center rounded-full glass shadow-soft text-white"
              aria-label={muted ? "Activer le son" : "Couper le son"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </>
        )}
        {media.length > 1 && (
          <>
            {idx > 0 && (
              <button onClick={() => setIdx((i) => i - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full glass shadow-soft"><ChevronLeft className="h-4 w-4" /></button>
            )}
            {idx < media.length - 1 && (
              <button onClick={() => setIdx((i) => i + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full glass shadow-soft"><ChevronRight className="h-4 w-4" /></button>
            )}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {media.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-1.5 bg-white/60"}`} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <button onClick={() => toggleLike.mutate()} className="flex items-center gap-1.5 text-sm transition active:scale-90">
            <Heart className={`h-6 w-6 transition ${(isMockPost ? mockLiked : liked) ? "fill-destructive text-destructive scale-110" : ""}`} />
            <span className="font-medium">{likeCount + (isMockPost && mockLiked ? 1 : 0)}</span>
          </button>
          <div className="group/react relative">
            <button className="flex items-center gap-1 rounded-full px-2 py-1 text-sm transition hover:bg-secondary" aria-label="Réagir">
              {myReaction
                ? <span className="text-lg leading-none">{REACTIONS.find((r) => r.key === myReaction)?.emoji}</span>
                : <SmilePlus className="h-5 w-5 text-muted-foreground" />}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-card p-1.5 opacity-0 shadow-elevated transition group-hover/react:pointer-events-auto group-hover/react:opacity-100">
              {REACTIONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => !isMockPost && applyReaction.mutate(myReaction === r.key ? null : r.key)}
                  className={`grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-125 ${myReaction === r.key ? "bg-primary/10" : ""}`}
                  aria-label={r.label}
                  title={r.label}
                >{r.emoji}</button>
              ))}
            </div>
          </div>
          <Link to={isMockPost ? "/" : "/post/$id"} params={isMockPost ? undefined as never : { id: post.id }} className="flex items-center gap-1.5 text-sm">
            <MessageCircle className="h-6 w-6" /> <span className="font-medium">{commentCount}</span>
          </Link>
          <button onClick={share} className="ml-auto grid h-9 w-9 place-items-center rounded-full transition hover:bg-secondary">
            <Share2 className="h-5 w-5" />
          </button>
          <button onClick={() => toggleSave.mutate()} className="grid h-9 w-9 place-items-center rounded-full transition hover:bg-secondary active:scale-90">
            <Bookmark className={`h-5 w-5 ${(isMockPost ? mockSaved : saved) ? "fill-current" : ""}`} />
          </button>
        </div>
        {post.caption && <p className="mt-3 text-sm"><Link to="/profile/$username" params={{ username }} className="font-semibold hover:underline">{username}</Link> {post.caption}</p>}
        {post.hashtags && post.hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {post.hashtags.map((h) => (
              <span key={h} className="text-xs font-medium text-accent">#{h}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ClientTime({ iso }: { iso: string }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    setText(formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr }));
  }, [iso]);
  return <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground">{text}</span>;
}

