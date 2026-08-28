import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Compass, Heart, Notebook, PlusCircle, Route as RouteIcon, Sparkles, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics produit — GlobeLink" },
      {
        name: "description",
        content: "Tableau de bord privé des indicateurs produit GlobeLink.",
      },
    ],
  }),
  component: ProductAnalyticsPage,
});

type CountItem = { event?: string; route?: string; count?: number; views?: number };
type DailyItem = { date: string; events: number; sessions: number; users: number };
type AnalyticsSummary = {
  days: number;
  since: string;
  total_events: number;
  page_views: number;
  unique_sessions: number;
  active_users: number;
  explorer_opens: number;
  voyage_opens: number;
  ai_opens: number;
  travel_match_opens: number;
  trips_created: number;
  trip_items_added: number;
  top_events: CountItem[];
  top_routes: CountItem[];
  daily: DailyItem[];
};

async function loadSummary() {
  const { data, error } = await (supabase.rpc as any)("get_product_analytics_summary", {
    p_days: 30,
  });
  if (error) throw error;
  return data as AnalyticsSummary;
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-display text-3xl font-bold">{Number(value || 0).toLocaleString("fr-FR")}</div>
    </div>
  );
}

function ProductAnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["product-analytics-summary", 30],
    queryFn: loadSummary,
    staleTime: 60_000,
    retry: false,
  });

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pt-8">
        <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                <Activity className="h-4 w-4" /> Analytics produit
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">Comprendre ce qui marche dans GlobeLink</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Vue privée sur les 30 derniers jours. Les événements sont volontairement minimisés : aucun e-mail, IP, texte libre ou nom exact de destination n’est collecté par le tracker.
              </p>
            </div>
            {data?.since && (
              <div className="rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Depuis le {new Date(data.since).toLocaleDateString("fr-FR")}
              </div>
            )}
          </div>
        </section>

        {isLoading ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="skeleton h-28 rounded-2xl" />
            ))}
          </div>
        ) : error || !data ? (
          <section className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
            <h2 className="font-display text-xl font-bold">Accès réservé à l’administration</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ce tableau de bord n’affiche aucune donnée sans le rôle administrateur GlobeLink.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Utilisateurs actifs" value={data.active_users} icon={Users} />
              <MetricCard label="Sessions" value={data.unique_sessions} icon={Activity} />
              <MetricCard label="Pages vues" value={data.page_views} icon={RouteIcon} />
              <MetricCard label="Explorer" value={data.explorer_opens} icon={Compass} />
              <MetricCard label="Voyage" value={data.voyage_opens} icon={Notebook} />
              <MetricCard label="GlobeLink IA" value={data.ai_opens} icon={Sparkles} />
              <MetricCard label="Travel Match" value={data.travel_match_opens} icon={Heart} />
              <MetricCard label="Voyages créés" value={data.trips_created} icon={PlusCircle} />
            </section>

            <section className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Conversion carnet</p>
                    <h2 className="mt-1 font-display text-2xl font-bold">Ajouts à un voyage</h2>
                  </div>
                  <div className="font-display text-3xl font-bold text-primary">
                    {Number(data.trip_items_added || 0).toLocaleString("fr-FR")}
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nombre d’hôtels, restaurants, activités ou lieux réellement ajoutés à un carnet.
                </p>
              </div>

              <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Volume</p>
                <h2 className="mt-1 font-display text-2xl font-bold">Événements mesurés</h2>
                <div className="mt-2 font-display text-3xl font-bold text-primary">
                  {Number(data.total_events || 0).toLocaleString("fr-FR")}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Signaux produit agrégés, sans contenu privé de l’utilisateur.
                </p>
              </div>
            </section>

            <section className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
                <h2 className="font-display text-xl font-bold">Événements les plus utilisés</h2>
                <div className="mt-4 space-y-2">
                  {(data.top_events ?? []).length ? (
                    data.top_events.map((item, index) => (
                      <div key={`${item.event}-${index}`} className="flex items-center justify-between gap-4 rounded-xl bg-secondary/45 px-3 py-2.5 text-sm">
                        <span className="truncate font-medium">{item.event}</span>
                        <span className="font-bold">{Number(item.count || 0).toLocaleString("fr-FR")}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Les premières données apparaîtront dès l’utilisation de la nouvelle version.</p>
                  )}
                </div>
              </div>

              <div className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
                <h2 className="font-display text-xl font-bold">Pages les plus consultées</h2>
                <div className="mt-4 space-y-2">
                  {(data.top_routes ?? []).length ? (
                    data.top_routes.map((item, index) => (
                      <div key={`${item.route}-${index}`} className="flex items-center justify-between gap-4 rounded-xl bg-secondary/45 px-3 py-2.5 text-sm">
                        <span className="truncate font-medium">{item.route}</span>
                        <span className="font-bold">{Number(item.views || 0).toLocaleString("fr-FR")}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune page vue enregistrée pour le moment.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-3 rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
              <h2 className="font-display text-xl font-bold">Activité quotidienne</h2>
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[620px] space-y-2">
                  {(data.daily ?? []).map((day) => (
                    <div key={day.date} className="grid grid-cols-[1.2fr_1fr_1fr_1fr] items-center gap-3 rounded-xl bg-secondary/40 px-3 py-2 text-sm">
                      <span className="font-medium">{new Date(`${day.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                      <span>{day.users} utilisateurs</span>
                      <span>{day.sessions} sessions</span>
                      <span>{day.events} événements</span>
                    </div>
                  ))}
                  {!(data.daily ?? []).length && <p className="text-sm text-muted-foreground">Pas encore de série quotidienne.</p>}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
