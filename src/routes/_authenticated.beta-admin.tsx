import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock3,
  Lightbulb,
  MessageCircleQuestion,
  ShieldAlert,
  TestTube2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { adminGetMyRoles } from "@/lib/admin.functions";
import { listSupportTicketsForStaff, type SupportTicket } from "@/lib/support";

export const Route = createFileRoute("/_authenticated/beta-admin")({
  ssr: false,
  loader: async () => ({ roles: await adminGetMyRoles() }),
  head: () => ({
    meta: [
      { title: "Bêta privée — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BetaAdminPage,
});

function BetaAdminPage() {
  const { roles } = Route.useLoaderData();
  const isStaff = roles.includes("admin") || roles.includes("moderator");

  const feedback = useQuery({
    queryKey: ["beta-feedback-admin"],
    enabled: isStaff,
    queryFn: async () => {
      const rows = await listSupportTicketsForStaff("all");
      return rows.filter((ticket) => ticket.context?.beta === true);
    },
    staleTime: 20_000,
  });

  const stats = useMemo(() => summarize(feedback.data ?? []), [feedback.data]);

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 font-display text-2xl">Accès refusé</h1>
          <p className="mt-2 text-sm text-muted-foreground">Le suivi de la bêta est réservé à l’équipe GlobeLink.</p>
          <Button asChild className="mt-5"><Link to="/">Retour</Link></Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <TestTube2 className="h-4 w-4" /> Bêta privée · vague 1
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Retours des testeurs</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Ici, on cherche d’abord les blocages et les incompréhensions. Les idées viennent ensuite.
            </p>
          </div>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link to="/support-admin">Traiter les tickets →</Link>
          </Button>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Retours" value={stats.total} icon={TestTube2} />
          <StatCard label="Bloquants" value={stats.blocking} icon={AlertTriangle} accent="danger" />
          <StatCard label="Bugs" value={stats.bugs} icon={Bug} />
          <StatCard label="Pas clair" value={stats.confusing} icon={MessageCircleQuestion} />
          <StatCard label="Résolus" value={stats.resolved} icon={CheckCircle2} accent="success" />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Pages qui posent problème</h2>
                <p className="mt-1 text-xs text-muted-foreground">Classées selon le nombre de retours bêta.</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {stats.pages.length === 0 ? (
                <p className="rounded-2xl bg-background/50 p-4 text-sm text-muted-foreground">Aucun retour pour l’instant.</p>
              ) : (
                stats.pages.map(([page, count]) => (
                  <div key={page} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/45 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{page}</span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Retours récents</h2>
                <p className="mt-1 text-xs text-muted-foreground">Les blocages sont affichés en priorité.</p>
              </div>
              <Clock3 className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="mt-4 space-y-3">
              {feedback.isLoading ? (
                <p className="rounded-2xl bg-background/50 p-4 text-sm text-muted-foreground">Chargement…</p>
              ) : (feedback.data ?? []).length === 0 ? (
                <p className="rounded-2xl bg-background/50 p-4 text-sm text-muted-foreground">Aucun retour bêta reçu.</p>
              ) : (
                [...(feedback.data ?? [])]
                  .sort((a, b) => priorityScore(b) - priorityScore(a) || Date.parse(b.created_at) - Date.parse(a.created_at))
                  .slice(0, 30)
                  .map((ticket) => <FeedbackCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function summarize(tickets: SupportTicket[]) {
  const pages = new Map<string, number>();
  let blocking = 0;
  let bugs = 0;
  let confusing = 0;
  let resolved = 0;

  for (const ticket of tickets) {
    const context = ticket.context ?? {};
    const page = typeof context.page === "string" ? context.page : "Page inconnue";
    pages.set(page, (pages.get(page) ?? 0) + 1);
    if (context.impact === "blocking") blocking += 1;
    if (context.feedback_kind === "bug") bugs += 1;
    if (context.feedback_kind === "confusing") confusing += 1;
    if (ticket.status === "resolved" || ticket.status === "closed") resolved += 1;
  }

  return {
    total: tickets.length,
    blocking,
    bugs,
    confusing,
    resolved,
    pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

function priorityScore(ticket: SupportTicket) {
  const context = ticket.context ?? {};
  if (context.impact === "blocking") return 100;
  if (context.feedback_kind === "bug") return 50;
  if (context.feedback_kind === "confusing") return 30;
  return 10;
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: number;
  icon: typeof TestTube2;
  accent?: "default" | "danger" | "success";
}) {
  const accentClass =
    accent === "danger"
      ? "bg-destructive/10 text-destructive"
      : accent === "success"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
        : "bg-primary/10 text-primary";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${accentClass}`}><Icon className="h-4 w-4" /></div>
      <div className="mt-3 font-display text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}

function FeedbackCard({ ticket }: { ticket: SupportTicket }) {
  const context = ticket.context ?? {};
  const kind = String(context.feedback_kind ?? "feedback");
  const impact = String(context.impact ?? "minor");
  const page = typeof context.page === "string" ? context.page : "Page inconnue";
  const viewport = typeof context.viewport === "string" ? context.viewport : null;
  const Icon = kind === "bug" ? Bug : kind === "confusing" ? MessageCircleQuestion : Lightbulb;
  const label = kind === "bug" ? "Bug" : kind === "confusing" ? "Pas clair" : "Idée";

  return (
    <article className={`rounded-2xl border p-4 ${impact === "blocking" ? "border-destructive/35 bg-destructive/[0.04]" : "border-border/70 bg-background/40"}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${impact === "blocking" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{label}</span>
            {impact === "blocking" && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">BLOQUANT</span>}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{ticket.status}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{ticket.message}</p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-semibold text-primary">{page}</span>
            {viewport && <span>{viewport}</span>}
            <span>{formatDate(ticket.created_at)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}
