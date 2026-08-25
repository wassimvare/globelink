import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LifeBuoy, Loader2, Save, Send, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminGetMyRoles } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  listSupportMessagesForTickets,
  listSupportTicketsForStaff,
  sendSupportMessage,
  updateSupportTicketAsStaff,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
  type SupportTicketMessage,
} from "@/lib/support";

export const Route = createFileRoute("/_authenticated/support-admin")({
  ssr: false,
  loader: async () => ({ roles: await adminGetMyRoles() }),
  head: () => ({ meta: [{ title: "Support — Administration GlobeLink" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SupportAdminPage,
});

const statusLabels: Record<SupportStatus, string> = {
  open: "Ouvert",
  in_progress: "En cours",
  waiting_user: "Attente utilisateur",
  resolved: "Résolu",
  closed: "Fermé",
};

const priorityLabels: Record<SupportPriority, string> = {
  low: "Faible",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

function SupportAdminPage() {
  const { roles } = Route.useLoaderData();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<SupportStatus | "all">("open");
  const [saving, setSaving] = useState<string | null>(null);
  const isStaff = roles.includes("admin") || roles.includes("moderator");

  const tickets = useQuery({
    queryKey: ["staff-support-tickets", filter],
    enabled: isStaff,
    queryFn: () => listSupportTicketsForStaff(filter),
  });

  const ticketIds = useMemo(() => (tickets.data ?? []).map((ticket) => ticket.id), [tickets.data]);
  const messages = useQuery({
    queryKey: ["staff-support-messages", ticketIds.join(",")],
    enabled: isStaff && ticketIds.length > 0,
    queryFn: () => listSupportMessagesForTickets(ticketIds),
  });
  const messagesByTicket = useMemo(() => {
    const map = new Map<string, SupportTicketMessage[]>();
    for (const message of messages.data ?? []) {
      const current = map.get(message.ticket_id) ?? [];
      current.push(message);
      map.set(message.ticket_id, current);
    }
    return map;
  }, [messages.data]);

  const userIds = useMemo(() => Array.from(new Set((tickets.data ?? []).map((ticket) => ticket.user_id))), [tickets.data]);
  const profiles = useQuery({
    queryKey: ["staff-support-profiles", userIds.join(",")],
    enabled: isStaff && userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,username,display_name").in("id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const profileMap = useMemo(() => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])), [profiles.data]);

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl">Accès refusé</h1>
          <p className="mt-2 text-sm text-muted-foreground">La gestion du support est réservée aux administrateurs et modérateurs GlobeLink.</p>
          <Button asChild className="mt-5"><Link to="/">Retour</Link></Button>
        </main>
      </div>
    );
  }

  async function saveTicket(ticket: SupportTicket, changes: { status: SupportStatus; priority: SupportPriority; reply: string }) {
    if (!user || saving) return;
    setSaving(ticket.id);
    try {
      const reply = changes.reply.trim();
      const effectiveStatus: SupportStatus = reply && (changes.status === "open" || changes.status === "in_progress")
        ? "waiting_user"
        : changes.status;

      await updateSupportTicketAsStaff(ticket.id, {
        status: effectiveStatus,
        priority: changes.priority,
        admin_reply: reply || ticket.admin_reply,
        handled_by: user.id,
        resolved_at: effectiveStatus === "resolved" || effectiveStatus === "closed" ? new Date().toISOString() : null,
      });

      if (reply) {
        await sendSupportMessage({ ticketId: ticket.id, senderId: user.id, senderKind: "staff", body: reply });
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["staff-support-tickets"] }),
        qc.invalidateQueries({ queryKey: ["staff-support-messages"] }),
        qc.invalidateQueries({ queryKey: ["support-tickets"] }),
        qc.invalidateQueries({ queryKey: ["support-ticket-messages"] }),
      ]);
      toast.success(reply ? "Réponse envoyée à l’utilisateur." : "Ticket support mis à jour.");
    } catch (error) {
      toast.error((error as Error).message || "Impossible de mettre à jour le ticket.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-9">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administration & modération</p>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Support GlobeLink</h1>
            <p className="mt-2 text-sm text-muted-foreground">Traite les bugs, problèmes de compte et demandes envoyées depuis le centre d’aide.</p>
          </div>
          {roles.includes("admin") && <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">Administration principale</Link>}
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {(["open", "in_progress", "waiting_user", "resolved", "closed", "all"] as const).map((status) => (
            <button key={status} type="button" onClick={() => setFilter(status)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${filter === status ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"}`}>
              {status === "all" ? "Tous" : statusLabels[status]}
            </button>
          ))}
        </div>

        {tickets.isLoading ? (
          <div className="flex justify-center rounded-[2rem] border border-border bg-card p-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…</div>
        ) : (tickets.data ?? []).length === 0 ? (
          <div className="rounded-[2rem] border border-border bg-card p-10 text-center text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />Aucun ticket dans cette catégorie.</div>
        ) : (
          <div className="space-y-4">
            {(tickets.data ?? []).map((ticket) => {
              const profile = profileMap.get(ticket.user_id);
              return (
                <SupportTicketEditor
                  key={ticket.id}
                  ticket={ticket}
                  messages={messagesByTicket.get(ticket.id) ?? []}
                  profileLabel={profile ? `${profile.display_name || profile.username} (@${profile.username})` : ticket.user_id}
                  saving={saving === ticket.id}
                  onSave={saveTicket}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function SupportTicketEditor({ ticket, messages, profileLabel, saving, onSave }: {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  profileLabel: string;
  saving: boolean;
  onSave: (ticket: SupportTicket, changes: { status: SupportStatus; priority: SupportPriority; reply: string }) => Promise<void>;
}) {
  const [status, setStatus] = useState<SupportStatus>(ticket.status);
  const [priority, setPriority] = useState<SupportPriority>(ticket.priority);
  const [reply, setReply] = useState("");

  return (
    <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><LifeBuoy className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold">{ticket.subject}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{profileLabel} · {formatDate(ticket.created_at)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-background/35 p-4">
        <ThreadMessage kind="user" body={ticket.message} createdAt={ticket.created_at} />
        {messages.map((message) => <ThreadMessage key={message.id} kind={message.sender_kind} body={message.body} createdAt={message.created_at} />)}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold">Statut<select value={status} onChange={(event) => setStatus(event.target.value as SupportStatus)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-2 text-sm font-semibold">Priorité<select value={priority} onChange={(event) => setPriority(event.target.value as SupportPriority)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <label className="mt-4 block space-y-2 text-sm font-semibold">
        Nouvelle réponse
        <Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={4} placeholder="Répondre à l’utilisateur…" className="rounded-2xl" />
      </label>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={() => void onSave(ticket, { status, priority, reply }).then(() => setReply(""))}
          disabled={saving}
          className="rounded-2xl"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : reply.trim() ? <Send className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
          {reply.trim() ? "Envoyer la réponse" : "Enregistrer"}
        </Button>
      </div>
    </section>
  );
}

function ThreadMessage({ kind, body, createdAt }: { kind: "user" | "staff"; body: string; createdAt: string }) {
  const staff = kind === "staff";
  return (
    <div className={`flex gap-2 ${staff ? "justify-end" : "justify-start"}`}>
      {!staff && <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary"><UserRound className="h-4 w-4" /></div>}
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 ${staff ? "bg-primary text-primary-foreground" : "bg-card border border-border/70"}`}>
        <p className="mb-1 text-[11px] font-semibold">{staff ? <><ShieldCheck className="mr-1 inline h-3 w-3" /> Équipe GlobeLink</> : "Utilisateur"}</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
        <p className={`mt-2 text-[10px] ${staff ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatDate(createdAt)}</p>
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
