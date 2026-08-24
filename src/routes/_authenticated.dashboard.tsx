import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { useReveal, useCountUp } from "@/hooks/use-reveal";
import {
  Globe2,
  Plane,
  Calendar,
  Wallet,
  Camera,
  MapPin,
  TrendingUp,
  Sparkles,
  Route as RouteIcon,
  Award,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

// Haversine distance in km
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function DashboardPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [posts, trips, entries, expenses, followers] = await Promise.all([
        supabase.from("posts").select("id, country, city, created_at").eq("user_id", user!.id),
        supabase
          .from("trips")
          .select("id, starts_on, ends_on, country, budget")
          .eq("user_id", user!.id),
        supabase
          .from("trip_entries")
          .select("id, trip_id, country, lat, lng, position, visited_on")
          .eq("user_id", user!.id),
        supabase.from("trip_expenses").select("amount").eq("user_id", user!.id),
        supabase
          .from("profiles")
          .select("followers_count, following_count")
          .eq("id", user!.id)
          .maybeSingle(),
      ]);
      return {
        posts: posts.data ?? [],
        trips: trips.data ?? [],
        entries: entries.data ?? [],
        expenses: expenses.data ?? [],
        profile: followers.data ?? { followers_count: 0, following_count: 0 },
      };
    },
  });

  const stats = useMemo(() => {
    const posts = data?.posts ?? [];
    const trips = data?.trips ?? [];
    const entries = data?.entries ?? [];
    const expenses = data?.expenses ?? [];

    const countries = new Set<string>();
    posts.forEach((p) => p.country && countries.add(p.country));
    entries.forEach((e) => e.country && countries.add(e.country));
    trips.forEach((t) => t.country && countries.add(t.country));

    let travelDays = 0;
    trips.forEach((t) => {
      if (t.starts_on && t.ends_on) {
        const d = (new Date(t.ends_on).getTime() - new Date(t.starts_on).getTime()) / 86_400_000;
        if (d > 0) travelDays += Math.round(d) + 1;
      }
    });

    // Distance: sum distances between consecutive entries per trip (ordered by position)
    const byTrip = new Map<string, typeof entries>();
    entries.forEach((e) => {
      if (!e.trip_id) return;
      const arr = byTrip.get(e.trip_id) ?? [];
      arr.push(e);
      byTrip.set(e.trip_id, arr);
    });
    let distanceKmTotal = 0;
    byTrip.forEach((arr) => {
      const sorted = [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1];
        const b = sorted[i];
        if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
          distanceKmTotal += distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
        }
      }
    });

    // Flights: heuristic — count trip segments over 800 km as a flight leg,
    // else at least 1 flight per trip with distinct country from previous.
    let flights = 0;
    byTrip.forEach((arr) => {
      const sorted = [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      let hadLeg = false;
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1];
        const b = sorted[i];
        if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
          const d = distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
          if (d > 800) {
            flights += 1;
            hadLeg = true;
          }
        }
      }
      if (!hadLeg && arr.length > 0) flights += 1; // outbound flight per trip
    });

    const budget = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

    return {
      countries: countries.size,
      travelDays,
      distanceKm: Math.round(distanceKmTotal),
      flights,
      budget,
      posts: posts.length,
      trips: trips.length,
      followers: data?.profile?.followers_count ?? 0,
      following: data?.profile?.following_count ?? 0,
    };
  }, [data]);

  return (
    <div className="app-page">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <HeroHeader />

        {isLoading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-40 rounded-3xl" />
            ))}
          </div>
        ) : (
          <>
            <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                i={0}
                label="Pays visités"
                value={stats.countries}
                unit="pays"
                icon={<Globe2 className="h-5 w-5" />}
                gradient="gradient-hero"
              />
              <StatCard
                i={1}
                label="Temps de voyage"
                value={stats.travelDays}
                unit={stats.travelDays > 1 ? "jours" : "jour"}
                icon={<Calendar className="h-5 w-5" />}
                gradient="gradient-aurora"
              />
              <StatCard
                i={2}
                label="Distance parcourue"
                value={stats.distanceKm}
                unit="km"
                icon={<RouteIcon className="h-5 w-5" />}
                gradient="gradient-sunset"
              />
              <StatCard
                i={3}
                label="Nombre de vols"
                value={stats.flights}
                unit={stats.flights > 1 ? "vols" : "vol"}
                icon={<Plane className="h-5 w-5" />}
                gradient="gradient-glow"
              />
              <StatCard
                i={4}
                label="Budget total"
                value={stats.budget}
                unit="€"
                icon={<Wallet className="h-5 w-5" />}
                gradient="gradient-hero"
                decimal
              />
              <StatCard
                i={5}
                label="Publications"
                value={stats.posts}
                unit="posts"
                icon={<Camera className="h-5 w-5" />}
                gradient="gradient-aurora"
              />
            </section>

            <section className="mt-10 grid gap-4 md:grid-cols-2">
              <PersonalCard
                title="Voyages"
                value={stats.trips}
                sub="carnets créés"
                icon={<MapPin className="h-6 w-6" />}
                to="/trips"
                cta="Voir mes carnets"
              />
              <PersonalCard
                title="Communauté"
                value={stats.followers}
                sub={`${stats.following} abonnements`}
                icon={<TrendingUp className="h-6 w-6" />}
                to="/"
                cta="Explorer le fil"
              />
            </section>

            <ProgressSection stats={stats} />
            <MilestonesSection stats={stats} />
          </>
        )}
      </main>
    </div>
  );
}

function HeroHeader() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-accent" />
        Tableau de bord
      </div>
      <h1 className="mt-2 font-display text-4xl sm:text-5xl">Ton voyage en chiffres</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Statistiques personnelles calculées en temps réel depuis tes publications, tes carnets et
        tes dépenses.
      </p>
    </div>
  );
}

function StatCard({
  i,
  label,
  value,
  unit,
  icon,
  gradient,
  decimal,
}: {
  i: number;
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  gradient: string;
  decimal?: boolean;
}) {
  const ref = useReveal<HTMLDivElement>();
  const num = useCountUp(decimal ? Math.round(value) : value);
  return (
    <div
      ref={ref}
      className="reveal hover-lift group relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft"
      style={{ animationDelay: `${i * 80}ms` }}
    >
      <div
        className={`absolute -right-10 -top-10 h-40 w-40 rounded-full ${gradient} opacity-20 blur-2xl transition group-hover:opacity-40`}
      />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span ref={num} className="font-display text-4xl sm:text-5xl tracking-tight">
              0
            </span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
        </div>
        <div
          className={`grid h-11 w-11 place-items-center rounded-2xl ${gradient} text-primary-foreground shadow-soft`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function PersonalCard({
  title,
  value,
  sub,
  icon,
  to,
  cta,
}: {
  title: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  to: string;
  cta: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal hover-lift rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-glow text-primary-foreground">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="font-display text-3xl">{value.toLocaleString("fr-FR")}</p>
        </div>
        <p className="ml-auto text-sm text-muted-foreground">{sub}</p>
      </div>
      <Link
        to={to}
        className="mt-5 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        {cta} →
      </Link>
    </div>
  );
}

function ProgressSection({
  stats,
}: {
  stats: { countries: number; travelDays: number; distanceKm: number };
}) {
  const ref = useReveal<HTMLDivElement>();
  const goals = [
    { label: "Objectif 10 pays", current: stats.countries, target: 10, tint: "gradient-hero" },
    {
      label: "30 jours de voyage / an",
      current: stats.travelDays,
      target: 30,
      tint: "gradient-aurora",
    },
    {
      label: "Tour du monde (40 000 km)",
      current: stats.distanceKm,
      target: 40000,
      tint: "gradient-sunset",
    },
  ];
  return (
    <section
      ref={ref}
      className="reveal mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <h2 className="font-display text-2xl">Objectifs</h2>
      <div className="mt-5 space-y-5">
        {goals.map((g) => {
          const pct = Math.min(100, (g.current / g.target) * 100);
          return (
            <div key={g.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium">{g.label}</span>
                <span className="text-muted-foreground">
                  {g.current.toLocaleString("fr-FR")} / {g.target.toLocaleString("fr-FR")}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full ${g.tint} transition-all duration-1000`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MilestonesSection({
  stats,
}: {
  stats: { countries: number; posts: number; trips: number; distanceKm: number };
}) {
  const ref = useReveal<HTMLDivElement>();
  const milestones = [
    { emoji: "✈️", label: "Premier voyage", unlocked: stats.trips >= 1 },
    { emoji: "📷", label: "10 publications", unlocked: stats.posts >= 10 },
    { emoji: "🌍", label: "5 pays visités", unlocked: stats.countries >= 5 },
    { emoji: "🏆", label: "Explorateur", unlocked: stats.countries >= 10 },
    { emoji: "🔥", label: "10 000 km", unlocked: stats.distanceKm >= 10000 },
    { emoji: "⭐", label: "Top créateur", unlocked: stats.posts >= 50 },
  ];
  return (
    <section
      ref={ref}
      className="reveal mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <div className="flex items-center gap-2">
        <Award className="h-5 w-5 text-accent" />
        <h2 className="font-display text-2xl">Récompenses</h2>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {milestones.map((m, i) => (
          <div
            key={m.label}
            className={`animate-scale-in rounded-2xl border p-4 text-center transition ${
              m.unlocked
                ? "border-accent/40 bg-gradient-to-br from-accent/10 to-transparent shadow-soft hover-lift"
                : "border-border bg-secondary/40 opacity-60 grayscale"
            }`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="text-3xl">{m.emoji}</div>
            <div className="mt-1 text-sm font-medium">{m.label}</div>
            <div className="text-xs text-muted-foreground">
              {m.unlocked ? "Débloqué" : "À venir"}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
