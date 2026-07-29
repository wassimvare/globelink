import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MapPin, Send, X, CornerDownRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getSignedMediaUrl } from "@/lib/storage";
import { AppHeader } from "@/components/AppHeader";
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
  id: string; post_id: string; user_id: string; content: string; parent_id: string | null; created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function PostDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  const { data: post, error } = useQuery({
    queryKey: ["post", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, profiles(username, display_name, avatar_url), post_likes(user_id)")
        .eq("id", id).maybeSingle();
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
        const { error } = await supabase.from("comment_likes").delete()
          .eq("comment_id", commentId).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("comment_likes")
          .insert({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comment-likes", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: reactionCounts } = useQuery({
    queryKey: ["reactions-count", id],
    queryFn: async () => {
      const { data } = await supabase.from("post_reactions").select("reaction").eq("post_id", id);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { reaction: string }) => { counts[r.reaction] = (counts[r.reaction] ?? 0) + 1; });
      return counts;
    },
  });

  const { data: myReaction } = useQuery({
    queryKey: ["my-reaction", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("post_reactions").select("reaction").eq("post_id", id).eq("user_id", user!.id).maybeSingle();
      return (data?.reaction ?? null) as ReactionKey | null;
    },
  });

  useEffect(() => { if (post) getSignedMediaUrl(post.image_url).then(setImgUrl); }, [post]);

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
        post_id: id, user_id: user.id, content: comment.trim(), parent_id: replyTo?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setComment(""); setReplyTo(null); qc.invalidateQueries({ queryKey: ["comments", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const liked = !!user && !!post?.post_likes.some((l: { user_id: string }) => l.user_id === user.id);
  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi");
      if (liked) await supabase.from("post_likes").delete().eq("post_id", id).eq("user_id", user.id);
      else await supabase.from("post_likes").insert({ post_id: id, user_id: user.id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyReaction = useMutation({
    mutationFn: async (r: ReactionKey | null) => {
      if (!user) throw new Error("Connecte-toi pour réagir");
      await setReaction(id, user.id, r);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-reaction", id, user?.id] });
      qc.invalidateQueries({ queryKey: ["reactions-count", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <div className="p-8">Erreur</div>;
  if (!post) return <div className="p-8">Chargement…</div>;

  const username = post.profiles?.username ?? "voyageur";

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="aspect-square w-full bg-muted">
            {imgUrl && <img src={imgUrl} alt={post.caption ?? ""} className="h-full w-full object-cover" />}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
            <Link to="/profile/$username" params={{ username }} className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-medium">
                {username[0]?.toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{post.profiles?.display_name ?? username}</div>
                {(post.city || post.country) && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {[post.city, post.country].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </Link>
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
              {tree.roots.length === 0 && <p className="text-sm text-muted-foreground">Aucun commentaire.</p>}
              {tree.roots.map((c) => (
                <CommentItem key={c.id} c={c} onReply={setReplyTo} replies={tree.kids[c.id] ?? []} likes={commentLikes} onToggleLike={(cid) => toggleCommentLike.mutate(cid)} />
              ))}
            </div>
            {user ? (
              <form onSubmit={(e) => { e.preventDefault(); addComment.mutate(); }} className="mt-4 space-y-2">
                {replyTo && (
                  <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <span>Réponse à <strong>@{replyTo.username}</strong></span>
                    <button type="button" onClick={() => setReplyTo(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={replyTo ? "Écris ta réponse…" : "Ajouter un commentaire…"} />
                  <Button type="submit" size="icon" className="rounded-xl gradient-hero text-primary-foreground"><Send className="h-4 w-4" /></Button>
                </div>
              </form>
            ) : (
              <Link to="/auth" className="mt-4 block text-center text-sm text-accent hover:underline">Connecte-toi pour commenter</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type LikeState = { counts: Record<string, number>; mine: Set<string> } | undefined;

function CommentItem({ c, replies, onReply, likes, onToggleLike }: {
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
          {replies.map((r) => <Row key={r.id} c={r} onReply={onReply} likes={likes} onToggleLike={onToggleLike} />)}
        </div>
      )}
    </div>
  );
}
function Row({ c, onReply, likes, onToggleLike }: {
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
      <div><Link to="/profile/$username" params={{ username: uname }} className="font-semibold hover:underline">{uname}</Link> <span>{c.content}</span></div>
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
        <button onClick={() => onReply({ id: c.id, username: uname })} className="font-medium hover:text-foreground">Répondre</button>
      </div>
    </div>
  );
}
