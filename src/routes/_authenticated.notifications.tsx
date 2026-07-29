import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Bell, Heart, MessageCircle, UserPlus, MessageSquare, Sparkles, CheckCheck, Star, MapPin, Plane, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { openOrCreateDirectConversation } from "@/lib/social";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — GlobeLink" }] }),
  component: NotificationsPage,
});

type Notif = {
  id: string;
  type: string;
  actor_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  metadata: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  actor?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifs } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Notif[];

      // No FK between notifications.actor_id and profiles → resolve actors separately.
      const actorIds = [...new Set(rows.map((n) => n.actor_id).filter(Boolean))] as string[];
      let actors: Record<string, Notif["actor"]> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", actorIds);
        actors = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      return rows.map((n) => ({ ...n, actor: n.actor_id ? actors[n.actor_id] ?? null : null }));
    },
  });

  // Mark all as read on mount
  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id).is("read_at", null).then(() => {
        qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] });
      });
  }, [user, qc]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const openMessage = async (n: Notif) => {
    if (!user) return;
    const convId = (n.metadata as { conversation_id?: string } | null)?.conversation_id;
    if (convId) return navigate({ to: "/messages/$id", params: { id: convId } });
    if (n.actor_id) {
      try {
        const id = await openOrCreateDirectConversation(user.id, n.actor_id);
        navigate({ to: "/messages/$id", params: { id } });
      } catch (e) { toast.error((e as Error).message); }
    }
  };

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Notifications</h1>
            <p className="text-sm text-muted-foreground">Toute l'activité qui te concerne</p>
          </div>
          <CheckCheck className="ml-auto h-5 w-5 text-muted-foreground" />
        </header>

        {(!notifs || notifs.length === 0) && (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">Rien pour l'instant. Publie ou suis des voyageurs pour lancer la conversation.</p>
          </div>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          {notifs?.map((n) => {
            const actorName = n.actor?.display_name ?? n.actor?.username ?? "Un voyageur";
            const meta = (n.metadata ?? {}) as { preview?: string; reaction?: string; product_id?: string; title?: string; rating?: number; spot_name?: string; destination?: string; drop_percent?: number; badge_name?: string };
            const label = describe(n.type, meta);
            const Icon = iconFor(n.type);
            const goPost = n.post_id ? () => navigate({ to: "/post/$id", params: { id: n.post_id! } }) : undefined;
            const onClick = n.type === "message" ? () => openMessage(n)
              : n.type === "review" && meta.product_id ? () => navigate({ to: "/marketplace/$id", params: { id: meta.product_id! } })
              : n.type === "follow" && n.actor?.username ? () => navigate({ to: "/profile/$username", params: { username: n.actor!.username } })
              : goPost;
            return (
              <li key={n.id}>
                <button onClick={onClick} className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-secondary/50">
                  <div className="relative shrink-0">
                    {n.actor?.avatar_url ? (
                      <img src={n.actor.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-sm font-medium">
                        {(actorName)[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Icon className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><span className="font-semibold">{actorName}</span> {label}</p>
                    {meta.preview && <p className="mt-0.5 truncate text-xs text-muted-foreground">« {meta.preview} »</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 text-center">
          <Button asChild variant="outline"><Link to="/">Retour au fil</Link></Button>
        </div>
      </div>
    </div>
  );
}

function describe(type: string, meta: { reaction?: string; title?: string; spot_name?: string; destination?: string; drop_percent?: number | string; badge_name?: string; rating?: number }) {
  switch (type) {
    case "like": return "a aimé ta publication";
    case "reaction": return `a réagi ${meta.reaction ?? ""} à ta publication`;
    case "comment": return "a commenté ta publication";
    case "reply": return "a répondu à ton commentaire";
    case "follow": return "s'est abonné à toi";
    case "message": return "t'a envoyé un message";
    case "mention": return "t'a mentionné";
    case "review": return `a laissé un avis ${meta.rating ? `${meta.rating}★ ` : ""}sur « ${meta.title ?? "ton produit"} »`;
    case "nearby_spot": return `Nouveau spot à découvrir près de toi : ${meta.spot_name ?? ""}`;
    case "price_drop": return `Les vols pour ${meta.destination ?? "ta destination"} ont baissé de ${meta.drop_percent ?? "?"}%`;
    case "badge": return `Nouveau badge débloqué : ${meta.badge_name ?? "récompense"}`;
    default: return "a interagi avec toi";
  }
}
function iconFor(type: string) {
  switch (type) {
    case "like": case "reaction": return Heart;
    case "comment": case "reply": return MessageCircle;
    case "follow": return UserPlus;
    case "message": return MessageSquare;
    case "review": return Star;
    case "nearby_spot": return MapPin;
    case "price_drop": return Plane;
    case "badge": return Trophy;
    default: return Sparkles;
  }
}
