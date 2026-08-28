import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  Clock3,
  Compass,
  Heart,
  Lightbulb,
  MessageCircleQuestion,
  Notebook,
  Route as RouteIcon,
  ShieldAlert,
  Sparkles,
  TestTube2,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { adminGetMyRoles } from "@/lib/admin.functions";
import { listSupportTicketsForStaff, type SupportTicket } from "@/lib/support";

const BETA_ROUND = "private-1";
const ANALYTICS_DAYS = 30;

export const Route = createFileRoute("/_authenticated/beta-admin")({
  ssr: false,
  loader: async () => ({ roles: await adminGetMyRoles() }),
  head: () => ({
    meta: [
      { title: "Analyse bêta — GlobeLink" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BetaAdminPage,
});

type FeatureUsage = {
  feature: string;
  event: string;
  opens: number;
  sessions: number;
  adoption: number;
};

type RouteUsage = { route: string; views: number };
type DailyUsage = { date: string; events: number; sessions: number; users: number; feedback: number };

type BetaAnalyticsSummary = {
  days: number;
  since: string;
  beta_round: string;
  testers: number;
  sessions: number;
  beta_entries: number;
  page_views: number;
  total_events: number;
  feedback_total: number;
  blocking_feedback: number;
  bug_feedback: number;
  confusing_feedback: number;
  resolved_feedback: number;
  explorer_opens: number;
  voyage_opens: number;
  ai_opens: number;
  travel_match_opens: number;
  trips_created: number;
  trip_items_added: number;
  top_routes: RouteUsage[];
  feature_usage: FeatureUsage[];
  daily: DailyUsage[];
};

async function loadBetaAnalytics() {
  const { data, error } = await (supabase.rpc as any)("get_beta_analytics_summary", {
    p_days: ANALYTICS_DAYS,
    p_beta_round: BETA_ROUND,
  });
  if (error) throw error;
  return data as BetaAnalyticsSummary;
}

function BetaAdminPage() {
  const { roles } = Route.useLoaderData();
  const isAdmin = roles.includes("admin");
  const isStaff = isAdmin || roles.includes("moderator");

  const feedback = useQuery({
    queryKey: ["beta-feedback-admin", BETA_ROUND],
    enabled: isStaff,
    queryFn: async () => {
      const rows = await listSupportTicketsForStaff("all");
      return rows.filter((ticket) => ticket.context?.beta === true && String(ticket.context?.beta_round ?? BETA_ROUND) === BETA_ROUND);
    },
    staleTime: 20_000,
  });

  const analytics = useQuery({
    queryKey: ["beta-analytics-admin", BETA_ROUND, ANALYTICS_DAYS],
    enabled: isAdmin,
    queryFn: loadBetaAnalytics,
    staleTime: 30_000,
    retry: false,
  });

  const stats = useMemo(() => summarize(feedback.data ?? []), [feedback.data]);
  const diagnostics = useMemo(() => buildDiagnostics(analytics.data, stats), [analytics.data, stats]);
  const featureCoverage = useMemo(() => {
    const features = analytics.data?.feature_usage ?? [];
    if (!features.length) return { used: 0, total: 0, percent: 0 };
    const used = features.filter((item) => Number(item.sessions || 0) > 0).length;
    return { used, total: features.length, percent: Math.round((used / features.length) * 100) };
  }, [analytics.data]);

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

  const data = analytics.data;
  const voyageSessions = featureSessions(data, "voyage_opened");
  const tripCreateSessions = featureSessions(data, "trip_created");
  const tripAddSessions = featureSessions(data, "trip_item_added");

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <TestTube2 className="h-4 w-4" /> Bêta privée · vague 1
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Analyse des tests bêta</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Comportement réel des testeurs, parcours, fonctions utilisées et retours réunis au même endroit pour savoir quoi corriger en priorité.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/analytics">Analytics globales</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link to="/support-admin">Traiter les tickets →</Link>
            </Button>
          </div>
        </div>

        {!isAdmin ? (
          <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-sm font-semibold">Les retours sont visibles avec le rôle modérateur.</p>
            <p className="mt-1 text-xs text-muted-foreground">Les statistiques comportementales de la bêta restent réservées au rôle administrateur.</p>
          </section>
        ) : analytics.isLoading ? (
          <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="skeleton h-32 rounded-2xl" />)}
          </section>
        ) : analytics.error || !data ? (
          <section className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <h2 className="font-display text-lg font-bold">Analyse comportementale en attente</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Le tableau de bord est prêt, mais la fonction Supabase de la nouvelle migration doit être disponible en production. Les retours bêta restent accessibles ci-dessous.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard label="Testeurs" value={data.testers} icon={Users} />
              <MetricCard label="Sessions" value={data.sessions} icon={Activity} />
              <MetricCard label="Pages vues" value={data.page_views} icon={RouteIcon} />
              <MetricCard label="Retours" value={Math.max(data.feedback_total, stats.total)} icon={TestTube2} />
              <MetricCard label="Bloquants" value={Math.max(data.blocking_feedback, stats.blocking)} icon={AlertTriangle} accent="danger" />
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Diagnostic automatique</p>
                    <h2 className="mt-1 font-display text-2xl font-bold">À corriger en priorité</h2>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">30 derniers jours</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {diagnostics.map((item, index) => (
                    <DiagnosticRow key={`${item.title}-${index}`} {...item} />
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Couverture des tests</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-display text-4xl font-bold">{featureCoverage.percent}%</div>
                    <p className="mt-1 text-xs text-muted-foreground">{featureCoverage.used}/{featureCoverage.total} fonctions clés utilisées</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${featureCoverage.percent}%` }} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                  <MiniMetric label="Voyages créés" value={data.trips_created} />
                  <MiniMetric label="Ajouts carnet" value={data.trip_items_added} />
                  <MiniMetric label="Bugs" value={Math.max(data.bug_feedback, stats.bugs)} />
                  <MiniMetric label="Pas clair" value={Math.max(data.confusing_feedback, stats.confusing)} />
                </div>
              </div>
            </section>

            <section className="mt-4 rounded-[1.75rem] border border-border bg-card p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Parcours des testeurs</p>
                  <h2 className="mt-1 font-display text-2xl font-bold">Où ils avancent et où ils décrochent</h2>
                </div>
                <span className="text-xs text-muted-foreground">Taux calculés par sessions</span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <FunnelCard
                  icon={Notebook}
                  label="Ouverture Voyage"
                  value={voyageSessions}
                  detail={`${percentOf(voyageSessions, data.sessions)}% des sessions bêta`}
                />
                <FunnelCard
                  icon={CheckCircle2}
                  label="Création d’un voyage"
                  value={tripCreateSessions}
                  detail={`${percentOf(tripCreateSessions, voyageSessions)}% après ouverture Voyage`}
                />
                <FunnelCard
                  icon={Compass}
                  label="Ajout dans le carnet"
                  value={tripAddSessions}
                  detail={`${percentOf(tripAddSessions, tripCreateSessions)}% après création`}
                />
              </div>
            </section>

            <section className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="font-display text-xl font-bold">Fonctions réellement utilisées</h2>
                <p className="mt-1 text-xs text-muted-foreground">Part des sessions bêta dans lesquelles chaque fonction a été ouverte ou utilisée.</p>
                <div className="mt-5 space-y-4">
                  {(data.feature_usage ?? []).map((item) => (
                    <FeatureUsageRow key={item.event} item={item} />
                  ))}
                  {!(data.feature_usage ?? []).length && <p className="text-sm text-muted-foreground">Pas encore de données d’utilisation.</p>}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border bg-card p-5 shadow-soft sm:p-6">
                <h2 className="font-display text-xl font-bold">Pages les plus parcourues</h2>
                <p className="mt-1 text-xs text-muted-foreground">Uniquement le trafic identifié comme bêta.</p>
                <div className="mt-4 space-y-2">
                  {(data.top_routes ?? []).length ? (
                    data.top_routes.map((item) => (
                      <div key={item.route} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/45 px-4 py-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{friendlyRoute(item.route)}</span>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{item.views}</span>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-background/50 p-4 text-sm text-muted-foreground">Aucune page bêta mesurée pour l’instant.</p>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <section className="mt-4 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
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
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{friendlyRoute(page)}</span>
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

type Diagnostic = {
  severity: "critical" | "warning" | "watch" | "success";
  title: string;
  detail: string;
};

function buildDiagnostics(data: BetaAnalyticsSummary | undefined, stats: ReturnType<typeof summarize>): Diagnostic[] {
  const result: Diagnostic[] = [];
  const blocking = Math.max(data?.blocking_feedback ?? 0, stats.blocking);
  const bugs = Math.max(data?.bug_feedback ?? 0, stats.bugs);
  const confusing = Math.max(data?.confusing_feedback ?? 0, stats.confusing);

  if (blocking > 0) {
    result.push({ severity: "critical", title: `${blocking} blocage${blocking > 1 ? "s" : ""} signalé${blocking > 1 ? "s" : ""}`, detail: "À traiter avant d’élargir la bêta : un testeur ne peut pas terminer son action." });
  }
  if (bugs > 0) {
    result.push({ severity: "warning", title: `${bugs} bug${bugs > 1 ? "s" : ""} remonté${bugs > 1 ? "s" : ""}`, detail: "Regrouper les bugs par page et corriger en priorité ceux qui touchent plusieurs testeurs." });
  }
  if (confusing > 0) {
    result.push({ severity: "warning", title: `${confusing} point${confusing > 1 ? "s" : ""} jugé${confusing > 1 ? "s" : ""} peu clair${confusing > 1 ? "s" : ""}`, detail: "Le parcours ou le libellé n’est pas assez évident sans explication." });
  }

  if (data) {
    const voyageSessions = featureSessions(data, "voyage_opened");
    const createSessions = featureSessions(data, "trip_created");
    const addSessions = featureSessions(data, "trip_item_added");
    if (voyageSessions >= 2 && createSessions === 0) {
      result.push({ severity: "warning", title: "Création de voyage à vérifier", detail: "Les testeurs ouvrent Voyage mais aucune session ne va jusqu’à la création d’un voyage." });
    } else if (createSessions > 0 && addSessions === 0) {
      result.push({ severity: "warning", title: "Carnet de voyage à vérifier", detail: "Des voyages sont créés mais aucun ajout au carnet n’est mesuré ensuite." });
    }

    const match = data.feature_usage?.find((item) => item.event === "travel_match_opened");
    if (data.sessions >= 3 && Number(match?.adoption ?? 0) < 20) {
      result.push({ severity: "watch", title: "Travel Match peu testé", detail: "Moins de 20 % des sessions bêta ouvrent cette fonction : il manque encore des données pour la valider." });
    }
  }

  if (!result.length) {
    result.push({ severity: "success", title: "Aucun problème prioritaire détecté", detail: "Continue à collecter des sessions et des retours avant de valider définitivement la vague 1." });
  }

  return result.slice(0, 5);
}

function featureSessions(data: BetaAnalyticsSummary | undefined, event: string) {
  return Number(data?.feature_usage?.find((item) => item.event === event)?.sessions ?? 0);
}

function percentOf(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function friendlyRoute(route: string) {
  const labels: Record<string, string> = {
    "/": "Accueil",
    "/map": "Explorer · Carte",
    "/destinations": "Explorer · Destinations",
    "/activities": "Explorer · Activités",
    "/trips": "Voyage",
    "/match": "Travel Match",
    "/ai-pro": "GlobeLink IA+",
    "/ai-trip": "GlobeLink IA",
    "/intelligence": "GlobeLink IA",
  };
  if (labels[route]) return labels[route];
  if (route.startsWith("/trips/")) return "Carnet de voyage";
  if (route.startsWith("/destinations/")) return "Fiche destination";
  if (route.startsWith("/activities/")) return "Fiche activité";
  return route;
}

function priorityScore(ticket: SupportTicket) {
  const context = ticket.context ?? {};
  if (context.impact === "blocking") return 100;
  if (context.feedback_kind === "bug") return 50;
  if (context.feedback_kind === "confusing") return 30;
  return 10;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: number;
  icon: typeof TestTube2;
  accent?: "default" | "danger";
}) {
  const accentClass = accent === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className={`grid h-9 w-9 place-items-center rounded-xl ${accentClass}`}><Icon className="h-4 w-4" /></div>
      <div className="mt-3 font-display text-3xl font-bold tabular-nums">{Number(value || 0).toLocaleString("fr-FR")}</div>
      <div className="mt-1 text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary/45 p-3">
      <div className="font-display text-xl font-bold tabular-nums">{Number(value || 0).toLocaleString("fr-FR")}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function DiagnosticRow({ severity, title, detail }: Diagnostic) {
  const style = severity === "critical"
    ? "border-destructive/30 bg-destructive/[0.05] text-destructive"
    : severity === "warning"
      ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-300"
      : severity === "success"
        ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300"
        : "border-border bg-background/55 text-foreground";
  const Icon = severity === "critical" || severity === "warning" ? AlertTriangle : severity === "success" ? CheckCircle2 : Lightbulb;
  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function FunnelCard({ icon: Icon, label, value, detail }: { icon: typeof Notebook; label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <span className="font-display text-3xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function FeatureUsageRow({ item }: { item: FeatureUsage }) {
  const adoption = Math.max(0, Math.min(100, Number(item.adoption || 0)));
  const Icon = item.event === "explorer_opened"
    ? Compass
    : item.event === "voyage_opened"
      ? Notebook
      : item.event === "ai_opened"
        ? Sparkles
        : item.event === "travel_match_opened"
          ? Heart
          : item.event === "trip_created"
            ? CheckCircle2
            : Activity;
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-semibold">{item.feature}</span>
            <span className="shrink-0 font-bold tabular-nums">{adoption.toLocaleString("fr-FR")}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary" style={{ width: `${adoption}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{item.sessions} session{item.sessions > 1 ? "s" : ""} · {item.opens} ouverture{item.opens > 1 ? "s" : ""}</p>
        </div>
      </div>
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
            <span className="font-semibold text-primary">{friendlyRoute(page)}</span>
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
