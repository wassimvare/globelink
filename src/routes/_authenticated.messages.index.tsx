import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getSuggestionExcludedUserIds } from "@/lib/account-settings";
import {
  listIncomingMessageRequests,
  respondToMessageRequest,
} from "@/lib/social-privacy";
import { AppHeader } from "@/components/AppHeader";
import { OnlineStatus } from "@/components/OnlineStatus";
import { Button } from "@/components/ui/button";
import { Check, Circle, Inbox, MessageSquare, Search, UserRoundPlus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — GlobeLink" },
      {
        name: "description",
        content:
          "Conversations privées GlobeLink avec photos, vidéos, vocaux, partages et statut de lecture.",
      },
      { property: "og:title", content: "Messages — GlobeLink" },
      {
        property: "og:description",
        content: "Conversations privées avec les voyageurs et les matchs GlobeLink.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MessagesPage,
});

type Row = {
  conversation_id: string;
  last_read_at: string;
  conversation: {
    id: string;
    last_message_at: string;
    participants: {
      user_id: string;
      profile: { username: string; display_name: string | null; avatar_url: string | null } | null;
    }[];
    messages: {
      content: string | null;
      created_at: string;
      sender_id: string;
      attachment_type: string | null;
    }[];
  } | null;
};

function MessagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [conversationResult, excluded] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select(
            `
            conversation_id,
            last_read_at,
            conversation:conversation_id (
              id, last_message_at,
              participants:conversation_participants ( user_id, profile:user_id ( username, display_name, avatar_url ) ),
              messages ( content, created_at, sender_id, attachment_type )
            )
          `,
          )
          .eq("user_id", user!.id),
        getSuggestionExcludedUserIds(user!.id),
      ]);
      const list = (conversationResult.data ?? []) as unknown as Row[];
      return list
        .filter((row) => {
          if (!row.conversation) return false;
          if (row.conversation.participants.length !== 2) return true;
          const other = row.conversation.participants.find(
            (participant) => participant.user_id !== user!.id,
          );
          return !other || !excluded.has(other.user_id);
        })
        .sort(
          (a, b) =>
            new Date(b.conversation!.last_message_at).getTime() -
            new Date(a.conversation!.last_message_at).getTime(),
        );
    },
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["incoming-message-requests", user?.id],
    enabled: !!user,
    queryFn: () => listIncomingMessageRequests(user!.id),
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`inbox-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const inserted = payload.new as { attachment_type?: string | null };
          if (inserted.attachment_type !== "rtc") {
            qc.invalidateQueries({ queryKey: ["conversations", user.id] });
            qc.invalidateQueries({ queryKey: ["incoming-message-requests", user.id] });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["conversations", user.id] });
          qc.invalidateQueries({ queryKey: ["incoming-message-requests", user.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => qc.invalidateQueries({ queryKey: ["conversations", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const incomingIds = useMemo(
    () => new Set(incomingRequests.map((request) => request.conversation_id)),
    [incomingRequests],
  );
  const requestRows = useMemo(
    () => (rows ?? []).filter((row) => incomingIds.has(row.conversation_id)),
    [rows, incomingIds],
  );

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (incomingIds.has(r.conversation_id)) return false;
      const other = r.conversation!.participants.find((p) => p.user_id !== user?.id);
      const name = (
        other?.profile?.display_name ??
        other?.profile?.username ??
        "Voyageur"
      ).toLowerCase();
      const visibleMessages = r.conversation!.messages.filter(
        (message) => message.attachment_type !== "rtc",
      );
      const last = [...visibleMessages].sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      )[0];
      const unread =
        !!last &&
        last.sender_id !== user?.id &&
        new Date(last.created_at) > new Date(r.last_read_at);
      if (onlyUnread && !unread) return false;
      if (!needle) return true;
      return name.includes(needle) || (last?.content ?? "").toLowerCase().includes(needle);
    });
  }, [rows, incomingIds, user?.id, query, onlyUnread]);

  async function answerRequest(conversationId: string, action: "accepted" | "declined") {
    if (!user || requestBusy) return;
    setRequestBusy(conversationId);
    try {
      await respondToMessageRequest(conversationId, action);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["incoming-message-requests", user.id] }),
        qc.invalidateQueries({ queryKey: ["conversations", user.id] }),
        qc.invalidateQueries({ queryKey: ["message-request", conversationId] }),
      ]);
      toast.success(action === "accepted" ? "Demande acceptée" : "Demande refusée");
    } catch (error) {
      toast.error((error as Error).message || "Action impossible");
    } finally {
      setRequestBusy(null);
    }
  }

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

        {requestRows.length > 0 && (
          <section className="mb-5 overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.035] shadow-soft">
            <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3 text-sm font-semibold">
              <UserRoundPlus className="h-4 w-4 text-primary" />
              Demandes de messages
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {requestRows.length}
              </span>
            </div>
            <div className="divide-y divide-border/70">
              {requestRows.map((row) => {
                const other = row.conversation!.participants.find((p) => p.user_id !== user!.id);
                const name = other?.profile?.display_name ?? other?.profile?.username ?? "Voyageur";
                const visibleMessages = row.conversation!.messages.filter(
                  (message) => message.attachment_type !== "rtc",
                );
                const first = [...visibleMessages].sort(
                  (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
                )[0];
                return (
                  <div key={row.conversation_id} className="p-4">
                    <div className="flex items-center gap-3">
                      {other?.profile?.avatar_url ? (
                        <img
                          src={other.profile.avatar_url}
                          alt=""
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="grid h-11 w-11 place-items-center rounded-full bg-secondary font-semibold">
                          {name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold">{name}</p>
                          {other && <OnlineStatus userId={other.user_id} showLabel={false} />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {first?.content || "Souhaite t'envoyer un message"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        disabled={requestBusy === row.conversation_id}
                        onClick={() => void answerRequest(row.conversation_id, "declined")}
                        className="rounded-xl"
                      >
                        <X className="mr-1 h-4 w-4" /> Refuser
                      </Button>
                      <Button
                        disabled={requestBusy === row.conversation_id}
                        onClick={() => void answerRequest(row.conversation_id, "accepted")}
                        className="rounded-xl"
                      >
                        <Check className="mr-1 h-4 w-4" /> Accepter
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mb-4 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une conversation…"
              className="h-11 w-full rounded-2xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary/40"
            />
          </label>
          <button
            type="button"
            onClick={() => setOnlyUnread((value) => !value)}
            className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-xs font-semibold transition ${onlyUnread ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}
          >
            <Circle className={`h-3 w-3 ${onlyUnread ? "fill-current" : ""}`} /> Non lus
          </button>
        </div>

        {!rows || (rows.length === 0 && requestRows.length === 0) ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Search className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune conversation pour le moment. Dès qu’un Travel Match est mutuel, il apparaît
              automatiquement ici.
            </p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center">
            <Inbox className="mx-auto h-6 w-6 text-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              Aucune conversation ne correspond à ce filtre.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            {visibleRows.map((r) => {
              const other = r.conversation!.participants.find((p) => p.user_id !== user!.id);
              const visibleMessages = r.conversation!.messages.filter(
                (message) => message.attachment_type !== "rtc",
              );
              const last = [...visibleMessages].sort(
                (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
              )[0];
              const unread =
                last &&
                last.sender_id !== user!.id &&
                new Date(last.created_at) > new Date(r.last_read_at);
              const name = other?.profile?.display_name ?? other?.profile?.username ?? "Voyageur";
              return (
                <li key={r.conversation_id}>
                  <Link
                    to="/messages/$id"
                    params={{ id: r.conversation_id }}
                    className="flex items-center gap-3 p-4 transition hover:bg-secondary/50"
                  >
                    {other?.profile?.avatar_url ? (
                      <img
                        src={other.profile.avatar_url}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-sm font-medium">
                        {name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold">{name}</span>
                          {other && <OnlineStatus userId={other.user_id} showLabel={false} />}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {last
                            ? formatDistanceToNow(new Date(last.created_at), {
                                addSuffix: true,
                                locale: fr,
                              })
                            : "—"}
                        </span>
                      </div>
                      <p
                        className={`truncate text-sm ${unread ? "font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        {last?.content ??
                          (last?.attachment_type
                            ? attachmentPreview(last.attachment_type)
                            : "✨ Conversation ouverte — envoie le premier message")}
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
