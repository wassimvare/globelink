import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MapPin,
  Send,
  X,
  CornerDownRight,
  ChevronLeft,
  ChevronRight,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getMediaManifestUrl, getSignedMediaUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
import { PostDetailActions } from "@/components/PostDetailActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REACTIONS, setReaction, type ReactionKey } from "@/lib/social";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/post/$id")({
  component: PostDetail,
});

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function PostDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mediaUrls, setMediaUrls] = useState<(string | null)[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  const { data: post, error } = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "*, profiles(username, display_name, avatar_url), post_likes(user_id), post_media(id, url, media_type, position, media_chunks, media_mime_type, media_size_bytes)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: comments } = useQuery({
    queryKey: ["comments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles(username, display_name, avatar_url)")
        .eq("post_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  const commentIds = useMemo(() => (comments ?? []).map((c) => c.id), [comments]);

  const { data: commentLikes } = useQuery({
    queryKey: ["comment-likes", id, commentIds.length],
    enabled: commentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);
      const counts: Record<string, number> = {};
      const mine = new Set<string>();
      (data ?? []).forEach((l) => {
        counts[l.comment_id] = (counts[l.comment_id] ?? 0) + 1;
        if (user && l.user_id === user.id) mine.add(l.comment_id);
      });
      return { counts, mine };
    },
  });

  const toggleCommentLike = useMutation({
    mutationFn: async (commentId: string) => {
      if (!user) throw new Error("Connecte-toi pour aimer un commentaire");
      if (commentLikes?.mine.has(commentId)) {
        const { error } = await supabase
          .from("comment_likes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("comment_likes")
          .insert({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comment-likes", id] }),
    onError: (e: Error) => {
      if (!user) {
        toast.info("Crée un compte pour aimer un commentaire.");
        navigate({ to: "/auth", search: { redirect: `/post/${id}` } });
      } else toast.error(e.message);
    },
  });

  const { data: reactionCounts } = useQuery({
    queryKey: ["reactions-count", id],
    queryFn: async () => {
      const { data } = await supabase.from("post_reactions").select("reaction").eq("post_id", id);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { reaction: string }) => {
        counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
      });
      return counts;
    },
  });

  const { data: myReaction } = useQuery({
    queryKey: ["my-reaction", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("post_reactions")
        .select("reaction")
        .eq("post_id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data?.reaction ?? null) as ReactionKey | null;
    },
  });

  const mediaRows = useMemo(() => {
    if (!post)
      return [] as Array<{
        id: string;
        url: string;
        media_type: string;
        position: number;
        media_chunks?: string[] | null;
        media_mime_type?: string | null;
        media_size_bytes?: number | null;
      }>;
    if (post.post_media?.length) {
      return [...post.post_media].sort((a: any, b: any) => a.position - b.position);
    }
    if (post.video_url)
      return [{ id: "legacy-video", url: post.video_url, media_type: "video", position: 0 }];
    return [{ id: "legacy-image", url: post.image_url, media_type: "image", position: 0 }];
  }, [post]);

  useEffect(() => {
    let active = true;
    setMediaIndex(0);
    setMediaUrls([]);
    Promise.all(
      mediaRows.map((media) =>
        getMediaManifestUrl(media.url, media.media_chunks, media.media_mime_type),
      ),
    ).then((urls) => {
      if (active) setMediaUrls(urls);
    });
    return () => {
      active = false;
    };
  }, [mediaRows]);

  useEffect(() => {
    let active = true;
    getSignedMediaUrl(post?.image_url).then((url) => {
      if (active) setCoverUrl(url);
    });
    return () => {
      active = false;
    };
  }, [post?.image_url]);

  const tree = useMemo(() => {
    const roots: CommentRow[] = [];
    const kids: Record<string, CommentRow[]> = {};
    (comments ?? []).forEach((c) => {
      if (c.parent_id) (kids[c.parent_id] ||= []).push(c);
      else roots.push(c);
    });
    return { roots, kids };
  }, [comments]);

  const addComment = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi pour commenter");
      if (!comment.trim()) return;
      const { error } = await supabase.from("comments").insert({
        post_id: id,
        user_id: user.id,
        content: comment.trim(),
        parent_id: replyTo?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComment("");
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ["comments", id] });
    },
    onError: (e: Error) => {
      if (!user) {
        toast.info("Crée un compte pour commenter.");
        navigate({ to: "/auth", search: { redirect: `/post/${id}` } });
      } else toast.error(e.message);
    },
  });

  const liked =
    !!user && !!post?.post_likes.some((l: { user_id: string }) => l.user_id === user.id);
  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("auth");
      const result = liked
        ? await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", user.id)
        : await supabase.from("post_likes").insert({ post_id: id, user_id: user.id });
      if (result.error) throw result.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post", id] }),
    onError: (e: Error) => {
      if (e.message === "auth") {
        toast.info("Crée un compte pour aimer cette publication.");
        navigate({ to: "/auth", search: { redirect: `/post/${id}` } });
      } else toast.error("Like non enregistré.");
    },
  });

  const applyReaction = useMutation({
    mutationFn: async (r: ReactionKey | null) => {
      if (!user) throw new Error("auth");
      await setReaction(id, user.id, r);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-reaction", id, user?.id] });
      qc.invalidateQueries({ queryKey: ["reactions-count", id] });
    },
    onError: (e: Error) => {
      if (e.message === "auth") {
        toast.info("Crée un compte pour réagir.");
        navigate({ to: "/auth", search: { redirect: `/post/${id}` } });
      } else toast.error("Réaction non enregistrée.");
    },
  });

  if (error) return <div className="p-8">Erreur</div>;
  if (!post) return <div className="p-8">Chargement…</div>;

  const username = post.profiles?.username ?? "voyageur";

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="relative aspect-square w-full overflow-hidden bg-muted">
            {(() => {
              const current = mediaRows[Math.min(mediaIndex, Math.max(0, mediaRows.length - 1))];
              const currentUrl = mediaUrls[Math.min(mediaIndex, Math.max(0, mediaUrls.length - 1))];
              if (!current) return <div className="skeleton h-full w-full" />;
              if (!currentUrl) {
                if ((current.media_type === "video" || current.media_type === "reel") && coverUrl) {
                  return (
                    <div className="relative h-full w-full bg-black">
                      <img
                        src={coverUrl}
                        alt="Aperçu de la vidéo"
                        className="h-full w-full object-cover opacity-80"
                      />
                      <div className="absolute inset-0 grid place-items-center bg-black/20">
                        <span className="rounded-full bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur">
                          Chargement de la vidéo…
                        </span>
                      </div>
                    </div>
                  );
                }
                return <div className="skeleton h-full w-full" />;
              }
              if (current.media_type === "video" || current.media_type === "reel") {
                return (
                  <video
                    key={current.id}
                    src={currentUrl}
                    poster={coverUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    autoPlay={mediaIndex > 0}
                    onEnded={() => {
                      if (
                        mediaIndex < mediaRows.length - 1 &&
                        mediaRows[mediaIndex + 1]?.media_type === "video"
                      ) {
                        setMediaIndex((value) => value + 1);
                      }
                    }}
                    className="h-full w-full bg-black object-contain"
                  />
                );
              }
              return (
                <img
                  src={currentUrl}
                  alt={post.caption ?? ""}
                  className="h-full w-full object-cover"
                />
              );
            })()}

            {mediaRows.length > 1 && (
              <>
                {mediaIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setMediaIndex((value) => value - 1)}
                    className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {mediaIndex < mediaRows.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setMediaIndex((value) => value + 1)}
                    className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur">
                  {mediaRows.map((media, index) => (
                    <span
                      key={media.id}
                      className={`h-1.5 rounded-full transition-all ${index === mediaIndex ? "w-5 bg-white" : "w-1.5 bg-white/55"}`}
                    />
                  ))}
                </div>
              </>
            )}
            {mediaRows[mediaIndex]?.media_type === "video" && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                <Play className="h-3 w-3 fill-current" /> Vidéo
                {mediaRows.length > 1 ? ` · ${mediaIndex + 1}/${mediaRows.length}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <Link
                to="/profile/$username"
                params={{ username }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium">
                  {username[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {post.profiles?.display_name ?? username}
                  </div>
                  {(post.city || post.country) && (
                    <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />{" "}
                      <span className="truncate">
                        {[post.city, post.country].filter(Boolean).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              <PostDetailActions
                postId={post.id}
                ownerId={post.user_id}
                currentUserId={user?.id}
                caption={post.caption}
                onUpdated={() => qc.invalidateQueries({ queryKey: ["post", id] })}
                onDeleted={async () => {
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ["feed"] }),
                    qc.invalidateQueries({ queryKey: ["profile-posts"] }),
                  ]);
                  navigate({ to: "/" });
                }}
              />
            </div>
            {post.caption && <p className="mt-4 text-sm">{post.caption}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3">
              <button onClick={() => toggleLike.mutate()} className="flex items-center gap-1.5">
                <Heart className={`h-5 w-5 ${liked ? "fill-destructive text-destructive" : ""}`} />
                <span className="text-sm font-medium">{post.post_likes.length}</span>
              </button>
              <div className="flex flex-wrap gap-1.5">
                {REACTIONS.map((r) => {
                  const c = reactionCounts?.[r.key] ?? 0;
                  const active = myReaction === r.key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => applyReaction.mutate(active ? null : r.key)}
                      className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition ${active ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"}`}
                      title={r.label}
                    >
                      <span className="text-base leading-none">{r.emoji}</span>
                      {c > 0 && <span className="font-medium">{c}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-display text-lg">Commentaires</h3>
            <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
              {tree.roots.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
              )}
              {tree.roots.map((c) => (
                <CommentItem
                  key={c.id}
                  c={c}
                  onReply={setReplyTo}
                  replies={tree.kids[c.id] ?? []}
                  likes={commentLikes}
                  onToggleLike={(cid) => toggleCommentLike.mutate(cid)}
                />
              ))}
            </div>
            {user ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addComment.mutate();
                }}
                className="mt-4 space-y-2"
              >
                {replyTo && (
                  <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <span>
                      Réponse à <strong>@{replyTo.username}</strong>
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)} className="ml-auto">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={replyTo ? "Écris ta réponse…" : "Ajouter un commentaire…"}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-xl gradient-hero text-primary-foreground"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            ) : (
              <Link
                to="/auth"
                search={{ redirect: `/post/${id}` }}
                className="mt-4 block rounded-xl border border-primary/20 bg-primary/5 p-3 text-center text-sm font-semibold text-primary"
              >
                Crée un compte pour commenter
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type LikeState = { counts: Record<string, number>; mine: Set<string> } | undefined;

function CommentItem({
  c,
  replies,
  onReply,
  likes,
  onToggleLike,
}: {
  c: CommentRow;
  replies: CommentRow[];
  onReply: (r: { id: string; username: string }) => void;
  likes: LikeState;
  onToggleLike: (commentId: string) => void;
}) {
  return (
    <div className="text-sm">
      <Row c={c} onReply={onReply} likes={likes} onToggleLike={onToggleLike} />
      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
          {replies.map((r) => (
            <Row key={r.id} c={r} onReply={onReply} likes={likes} onToggleLike={onToggleLike} />
          ))}
        </div>
      )}
    </div>
  );
}
function Row({
  c,
  onReply,
  likes,
  onToggleLike,
}: {
  c: CommentRow;
  onReply: (r: { id: string; username: string }) => void;
  likes: LikeState;
  onToggleLike: (commentId: string) => void;
}) {
  const uname = c.profiles?.username ?? "voyageur";
  const count = likes?.counts[c.id] ?? 0;
  const mine = !!likes?.mine.has(c.id);
  return (
    <div>
      <div>
        <Link
          to="/profile/$username"
          params={{ username: uname }}
          className="font-semibold hover:underline"
        >
          {uname}
        </Link>{" "}
        <span>{c.content}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: fr })}</span>
        <button
          onClick={() => onToggleLike(c.id)}
          aria-label={mine ? "Retirer le like" : "Aimer ce commentaire"}
          className="flex items-center gap-1 font-medium transition hover:text-foreground"
        >
          <Heart className={`h-3.5 w-3.5 ${mine ? "fill-destructive text-destructive" : ""}`} />
          {count > 0 && <span>{count}</span>}
        </button>
        <button
          onClick={() => onReply({ id: c.id, username: uname })}
          className="font-medium hover:text-foreground"
        >
          Répondre
        </button>
      </div>
    </div>
  );
}
