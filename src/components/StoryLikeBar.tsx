import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getSignedMediaUrl } from "@/lib/storage";
import { toast } from "sonner";

type Liker = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
};

/** Like button + (for the story owner) the count and the list of people who liked. */
export function StoryLikeBar({ storyId, ownerId }: { storyId: string; ownerId?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showList, setShowList] = useState(false);
  const isOwner = !!user && user.id === ownerId;

  const { data: likes } = useQuery({
    queryKey: ["story-likes", storyId, user?.id],
    enabled: !!user,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Liker[]> => {
      const { data, error } = await supabase
        .from("story_likes")
        .select("user_id")
        .eq("story_id", storyId);
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in(
          "id",
          rows.map((r) => r.user_id),
        );
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return await Promise.all(
        rows.map(async (r) => {
          const p = map.get(r.user_id);
          return {
            user_id: r.user_id,
            username: p?.username ?? "voyageur",
            display_name: p?.display_name ?? null,
            avatar: p?.avatar_url ? await getSignedMediaUrl(p.avatar_url) : null,
          };
        }),
      );
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`story-likes-${storyId}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "story_likes", filter: `story_id=eq.${storyId}` },
        () => void qc.invalidateQueries({ queryKey: ["story-likes", storyId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storyId, user, qc]);

  const liked = !!likes?.some((l) => l.user_id === user?.id);
  const count = likes?.length ?? 0;

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Connecte-toi pour aimer une story");
      if (liked) {
        const { error } = await supabase
          .from("story_likes")
          .delete()
          .eq("story_id", storyId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("story_likes")
          .upsert(
            { story_id: storyId, user_id: user.id },
            { onConflict: "story_id,user_id", ignoreDuplicates: true },
          );
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["story-likes", storyId] });
      toast.success(liked ? "Like retiré" : "Story aimée");
    },
    onError: (e: Error) => toast.error(e.message || "Le like n’a pas pu être enregistré"),
  });

  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {!isOwner && (
          <button
            type="button"
            aria-label={liked ? "Retirer le like" : "Aimer cette story"}
            aria-pressed={liked}
            onClick={(e) => {
              e.stopPropagation();
              toggle.mutate();
            }}
            disabled={toggle.isPending}
            className="grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90 disabled:cursor-wait disabled:opacity-60"
          >
            <Heart className={`h-6 w-6 ${liked ? "fill-red-500 text-red-500" : ""}`} />
          </button>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowList(true);
            }}
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-sm font-medium text-white backdrop-blur"
          >
            <Heart className="h-5 w-5 fill-white" />
            {count} {count > 1 ? "likes" : "like"}
          </button>
        )}
      </div>

      {isOwner && showList && (
        <div
          className="absolute inset-0 z-40 flex items-end bg-black/60"
          onClick={(e) => {
            e.stopPropagation();
            setShowList(false);
          }}
        >
          <div
            className="max-h-[70%] w-full overflow-y-auto rounded-t-3xl bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center">
              <h2 className="font-display text-lg">Likes ({count})</h2>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowList(false)}
                className="ml-auto grid h-9 w-9 place-items-center rounded-full bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {count === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Personne n'a encore aimé cette story.
              </p>
            )}
            <ul className="space-y-3">
              {likes?.map((l) => (
                <li key={l.user_id} className="flex items-center gap-3">
                  {l.avatar ? (
                    <img src={l.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-sm font-medium">
                      {(l.display_name ?? l.username)[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.display_name ?? l.username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{l.username}</p>
                  </div>
                  <Heart className="ml-auto h-4 w-4 fill-red-500 text-red-500" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
