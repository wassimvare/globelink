import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { MessageSquare, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({ meta: [
    { title: "Messages — GlobeLink" },
    { name: "description", content: "Conversations privées GlobeLink avec photos, vidéos, vocaux, partages et statut de lecture." },
    { property: "og:title", content: "Messages — GlobeLink" },
    { property: "og:description", content: "Conversations privées avec les voyageurs et les matchs GlobeLink." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: MessagesPage,
});

type Row = {
  conversation_id: string;
  last_read_at: string;
  conversation: {
    id: string;
    last_message_at: string;
    participants: { user_id: string; profile: { username: string; display_name: string | null; avatar_url: string | null } | null }[];
    messages: { content: string | null; created_at: string; sender_id: string; attachment_type: string | null }[];
  } | null;
};


function MessagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: rows } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_participants")
        .select(`
          conversation_id,
          last_read_at,
          conversation:conversation_id (
            id, last_message_at,
            participants:conversation_participants ( user_id, profile:user_id ( username, display_name, avatar_url ) ),
            messages ( content, created_at, sender_id, attachment_type )
          )
        `)
        .eq("user_id", user!.id);
      const list = (data ?? []) as unknown as Row[];
      return list
        .filter((r) => r.conversation)
        .sort((a, b) => new Date(b.conversation!.last_message_at).getTime() - new Date(a.conversation!.last_message_at).getTime());
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`inbox-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const inserted = payload.new as { attachment_type?: string | null };
          if (inserted.attachment_type !== "rtc") qc.invalidateQueries({ queryKey: ["conversations", user.id] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-2xl px-4 py-8">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Messages</h1>
            <p className="text-sm text-muted-foreground">Discussions privées avec la communauté</p>
          </div>
        </header>

        {(!rows || rows.length === 0) ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Search className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune conversation. Ouvre le profil d'un voyageur et clique sur « Commencer une conversation ».
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            {rows.map((r) => {
              const other = r.conversation!.participants.find((p) => p.user_id !== user!.id);
              const visibleMessages = r.conversation!.messages.filter((message) => message.attachment_type !== "rtc");
              const last = [...visibleMessages].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
              const unread = last && last.sender_id !== user!.id && new Date(last.created_at) > new Date(r.last_read_at);
              const name = other?.profile?.display_name ?? other?.profile?.username ?? "Voyageur";
              return (
                <li key={r.conversation_id}>
                  <Link to="/messages/$id" params={{ id: r.conversation_id }} className="flex items-center gap-3 p-4 transition hover:bg-secondary/50">
                    {other?.profile?.avatar_url
                      ? <img src={other.profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                      : <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-sm font-medium">{name[0]?.toUpperCase()}</div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {last ? formatDistanceToNow(new Date(last.created_at), { addSuffix: true, locale: fr }) : "—"}
                        </span>
                      </div>
                      <p className={`truncate text-sm ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {last?.content ?? (last?.attachment_type ? attachmentPreview(last.attachment_type) : "Nouvelle conversation")}
                      </p>
                    </div>
                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function attachmentPreview(type: string) {
  if (type === "image") return "📷 Photo";
  if (type === "video") return "🎬 Vidéo";
  if (type === "voice") return "🎙️ Message vocal";
  if (type === "share") return "📎 Partage";
  if (type === "call") return "📞 Appel";
  return "Pièce jointe";
}

