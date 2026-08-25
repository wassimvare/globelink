import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Loader2, Send, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  listMySupportTickets,
  listSupportMessagesForTickets,
  sendSupportMessage,
  type SupportStatus,
} from "@/lib/support";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const statusLabels: Record<SupportStatus, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "En attente de votre réponse",
  resolved: "Résolu",
  closed: "Fermé",
};

export function SupportConversations() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["support-tickets", user?.id],
    enabled: !!user,
    queryFn: () => listMySupportTickets(user!.id),
  });

  const ticketIds = useMemo(() => (tickets.data ?? []).map((ticket) => ticket.id), [tickets.data]);
  const messages = useQuery({
    queryKey: ["support-ticket-messages", user?.id, ticketIds.join(",")],
    enabled: !!user && ticketIds.length > 0,
    queryFn: () => listSupportMessagesForTickets(ticketIds),
  });

  const byTicket = useMemo(() => {
    const map = new Map<string, NonNullable<typeof messages.data>>();
    for (const message of messages.data ?? []) {
      const current = map.get(message.ticket_id) ?? [];
      current.push(message);
      map.set(message.ticket_id, current);
    }
    return map;
  }, [messages.data]);

  async function reply(ticketId: string) {
    if (!user || sendingId) return;
    const body = (drafts[ticketId] ?? "").trim();
    if (!body) return toast.error("Écris un message avant d’envoyer.");
    setSendingId(ticketId);
    try {
      await sendSupportMessage({ ticketId, senderId: user.id, senderKind: "user", body });
      setDrafts((current) => ({ ...current, [ticketId]: "" }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["support-tickets", user.id] }),
        qc.invalidateQueries({ queryKey: ["support-ticket-messages", user.id] }),
      ]);
      toast.success("Réponse envoyée au support GlobeLink.");
    } catch (error) {
      toast.error((error as Error).message || "Impossible d’envoyer la réponse.");
    } finally {
      setSendingId(null);
    }
  }

  if (tickets.isLoading) {
    return (
      <section className="mb-6 rounded-[2rem] border border-border/70 bg-card p-6 shadow-soft">
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement des conversations support…
        </div>
      </section>
    );
  }

  if ((tickets.data ?? []).length === 0) return null;

  return (
    <section className="mb-6 rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Conversations support</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Réponds directement à l’administrateur ou au modérateur qui traite ta demande.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {(tickets.data ?? []).map((ticket) => {
          const thread = byTicket.get(ticket.id) ?? [];
          const canReply = ticket.status !== "closed";
          return (
            <article key={ticket.id} className="overflow-hidden rounded-2xl border border-border/70 bg-background/35">
              <div className="border-b border-border/60 p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{ticket.subject}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Créé le {formatDate(ticket.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ticket.status === "waiting_user" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : ticket.status === "closed" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {statusLabels[ticket.status]}
                  </span>
                </div>
              </div>

              <div className="space-y-3 p-4">
                <MessageBubble kind="user" body={ticket.message} createdAt={ticket.created_at} />
                {messages.isLoading && <p className="text-xs text-muted-foreground">Chargement de la conversation…</p>}
                {thread.map((message) => (
                  <MessageBubble key={message.id} kind={message.sender_kind} body={message.body} createdAt={message.created_at} />
                ))}
              </div>

              {canReply ? (
                <div className="border-t border-border/60 p-4">
                  <Textarea
                    value={drafts[ticket.id] ?? ""}
                    onChange={(event) => setDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                    maxLength={5000}
                    rows={3}
                    placeholder={ticket.status === "waiting_user" ? "Répondre à GlobeLink…" : "Ajouter un message…"}
                    className="rounded-2xl"
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      onClick={() => void reply(ticket.id)}
                      disabled={sendingId === ticket.id || !(drafts[ticket.id] ?? "").trim()}
                      className="rounded-2xl"
                    >
                      {sendingId === ticket.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Répondre
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                  Cette demande est fermée. Ouvre une nouvelle demande si tu as encore besoin d’aide.
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MessageBubble({ kind, body, createdAt }: { kind: "user" | "staff"; body: string; createdAt: string }) {
  const staff = kind === "staff";
  return (
    <div className={`flex gap-2 ${staff ? "justify-start" : "justify-end"}`}>
      {staff && (
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </div>
      )}
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${staff ? "border border-primary/15 bg-primary/[0.06]" : "bg-secondary"}`}>
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold">
          {staff ? "Support GlobeLink" : <><UserRound className="h-3 w-3" /> Vous</>}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
        <p className="mt-2 text-[10px] text-muted-foreground">{formatDate(createdAt)}</p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
