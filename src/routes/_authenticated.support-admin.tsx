import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, LifeBuoy, Loader2, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { adminGetMyRoles } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  listSupportTicketsForStaff,
  updateSupportTicketAsStaff,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
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

  const tickets = useQuery({
    queryKey: ["staff-support-tickets", filter],
    enabled: roles.includes("admin"),
    queryFn: () => listSupportTicketsForStaff(filter),
  });

  const userIds = useMemo(() => Array.from(new Set((tickets.data ?? []).map((ticket) => ticket.user_id))), [tickets.data]);
  const profiles = useQuery({
    queryKey: ["staff-support-profiles", userIds.join(",")],
    enabled: roles.includes("admin") && userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,username,display_name").in("id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const profileMap = useMemo(() => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])), [profiles.data]);

  if (!roles.includes("admin")) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl">Accès refusé</h1>
          <p className="mt-2 text-sm text-muted-foreground">Cette page est réservée aux administrateurs GlobeLink.</p>
          <Button asChild className="mt-5"><Link to="/">Retour</Link></Button>
        </main>
      </div>
    );
  }

  async function saveTicket(ticket: SupportTicket, changes: { status: SupportStatus; priority: SupportPriority; admin_reply: string }) {
    if (!user || saving) return;
    setSaving(ticket.id);
    try {
      await updateSupportTicketAsStaff(ticket.id, {
        status: changes.status,
        priority: changes.priority,
        admin_reply: changes.admin_reply.trim() || null,
        handled_by: user.id,
        resolved_at: changes.status === "resolved" || changes.status === "closed" ? new Date().toISOString() : null,
      });
      await qc.invalidateQueries({ queryKey: ["staff-support-tickets"] });
      toast.success("Ticket support mis à jour.");
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Administration</p>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Support GlobeLink</h1>
            <p className="mt-2 text-sm text-muted-foreground">Traite les bugs, problèmes de compte et demandes envoyées depuis le centre d’aide.</p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">Administration principale</Link>
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
              return <SupportTicketEditor key={ticket.id} ticket={ticket} profileLabel={profile ? `${profile.display_name || profile.username} (@${profile.username})` : ticket.user_id} saving={saving === ticket.id} onSave={saveTicket} />;
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function SupportTicketEditor({ ticket, profileLabel, saving, onSave }: { ticket: SupportTicket; profileLabel: string; saving: boolean; onSave: (ticket: SupportTicket, changes: { status: SupportStatus; priority: SupportPriority; admin_reply: string }) => Promise<void> }) {
  const [status, setStatus] = useState<SupportStatus>(ticket.status);
  const [priority, setPriority] = useState<SupportPriority>(ticket.priority);
  const [reply, setReply] = useState(ticket.admin_reply ?? "");

  return (
    <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><LifeBuoy className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold">{ticket.subject}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{profileLabel} · {new Date(ticket.created_at).toLocaleString("fr-FR")}</p>
        </div>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-border/70 bg-background/45 p-4 text-sm leading-relaxed">{ticket.message}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold">Statut<select value={status} onChange={(event) => setStatus(event.target.value as SupportStatus)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-2 text-sm font-semibold">Priorité<select value={priority} onChange={(event) => setPriority(event.target.value as SupportPriority)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <label className="mt-4 block space-y-2 text-sm font-semibold">Réponse à l’utilisateur<Textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={5} placeholder="Réponse visible dans Aide et support…" className="rounded-2xl" /></label>
      <div className="mt-4 flex justify-end"><Button onClick={() => void onSave(ticket, { status, priority, admin_reply: reply })} disabled={saving} className="rounded-2xl">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer</Button></div>
    </section>
  );
}
