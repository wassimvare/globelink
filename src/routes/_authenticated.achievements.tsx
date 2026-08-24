import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import {
  LEVELS,
  BADGES,
  computeXp,
  getLevel,
  evaluateBadges,
  type UserStats,
} from "@/lib/gamification";
import { Trophy, Lock, Sparkles } from "lucide-react";
import { useCountUp } from "@/hooks/use-reveal";

export const Route = createFileRoute("/_authenticated/achievements")({
  head: () => ({ meta: [{ title: "Récompenses — GlobeLink" }] }),
  component: AchievementsPage,
});

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

function AchievementsPage() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["gamification", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [posts, trips, entries, myPostIds] = await Promise.all([
        supabase.from("posts").select("id, country, video_url, created_at").eq("user_id", user!.id),
        supabase.from("trips").select("id, country").eq("user_id", user!.id),
        supabase
          .from("trip_entries")
          .select("trip_id, country, lat, lng, position")
          .eq("user_id", user!.id),
        supabase.from("posts").select("id").eq("user_id", user!.id),
      ]);
      const postIds = (myPostIds.data ?? []).map((p) => p.id);
      let likes = 0;
      if (postIds.length) {
        const { count } = await supabase
          .from("post_likes")
          .select("post_id", { count: "exact", head: true })
          .in("post_id", postIds);
        likes = count ?? 0;
      }
      return {
        posts: posts.data ?? [],
        trips: trips.data ?? [],
        entries: entries.data ?? [],
        likes,
      };
    },
  });

  const stats: UserStats = useMemo(() => {
    const posts = data?.posts ?? [];
    const trips = data?.trips ?? [];
    const entries = data?.entries ?? [];
    const countries = new Set<string>();
    posts.forEach((p) => p.country && countries.add(p.country));
    entries.forEach((e) => e.country && countries.add(e.country));
    trips.forEach((t) => t.country && countries.add(t.country));

    const byTrip = new Map<string, typeof entries>();
    entries.forEach((e) => {
      if (!e.trip_id) return;
      const arr = byTrip.get(e.trip_id) ?? [];
      arr.push(e);
      byTrip.set(e.trip_id, arr);
    });
    let dist = 0;
    byTrip.forEach((arr) => {
      const sorted = [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1],
          b = sorted[i];
        if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
          dist += distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
        }
      }
    });
    const reels = posts.filter((p) => !!p.video_url).length;
    return {
      countries: countries.size,
      posts: posts.length,
      likes: data?.likes ?? 0,
      distanceKm: Math.round(dist),
      trips: trips.length,
      reels,
    };
  }, [data]);

  const xp = computeXp(stats);
  const level = getLevel(xp);
  const badges = evaluateBadges(stats);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-hero text-primary-foreground shadow-soft">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Récompenses</h1>
            <p className="text-sm text-muted-foreground">
              Progresse, débloque des badges, monte de niveau.
            </p>
          </div>
        </header>

        <LevelCard xp={xp} level={level} />

        <StatsStrip stats={stats} />

        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Badges</h2>
            <span className="text-xs text-muted-foreground">
              {unlockedCount}/{BADGES.length} débloqués
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {badges.map((b) => (
              <BadgeCard key={b.key} b={b} />
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Parcours de niveaux</h2>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {LEVELS.map((l) => {
              const reached = xp >= l.minXp;
              const isCurrent = l.key === level.current.key;
              return (
                <li
                  key={l.key}
                  className={`relative overflow-hidden rounded-2xl border p-3 text-center shadow-soft transition ${
                    isCurrent
                      ? "border-primary bg-card ring-2 ring-primary/40"
                      : reached
                        ? "border-border bg-card"
                        : "border-dashed border-border bg-muted/30 opacity-70"
                  }`}
                >
                  <div
                    className={`mx-auto mb-1 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br ${l.gradient} text-lg text-white shadow`}
                  >
                    {l.emoji}
                  </div>
                  <p className="text-sm font-semibold">{l.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {l.minXp.toLocaleString("fr-FR")} XP
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mt-8 text-center">
          <Link
            to="/dashboard"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Voir mon tableau de bord
          </Link>
        </div>
      </main>
    </div>
  );
}

function LevelCard({ xp, level }: { xp: number; level: ReturnType<typeof getLevel> }) {
  const [width, setWidth] = useState(0);
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Animate width in on mount so the fill glides from 0.
    const id = requestAnimationFrame(() => setWidth(level.progress * 100));
    return () => cancelAnimationFrame(id);
  }, [level.progress]);
  const xpRef = useCountUp(xp);

  const remaining = level.next ? Math.max(0, level.next.minXp - xp) : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft`}
    >
      <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${level.current.gradient}`} />
      <div className="relative">
        <div className="flex items-center gap-3">
          <div
            className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${level.current.gradient} text-2xl text-white shadow-glow`}
          >
            {level.current.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Niveau actuel</p>
            <h2 className="font-display text-2xl font-semibold">{level.current.label}</h2>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">XP</p>
            <p className="font-display text-xl font-semibold">
              <span ref={xpRef}>0</span>
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div ref={barRef} className="relative h-3 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${level.current.gradient} transition-[width] duration-[1400ms] ease-out`}
              style={{ width: `${width}%` }}
            />
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {level.current.emoji} {level.current.label}
            </span>
            {level.next ? (
              <span>
                <Sparkles className="mr-1 inline h-3 w-3 text-accent" />
                {remaining.toLocaleString("fr-FR")} XP jusqu'à {level.next.label}
              </span>
            ) : (
              <span className="font-medium text-primary">Niveau max atteint 🎉</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsStrip({ stats }: { stats: UserStats }) {
  const items = [
    { label: "Pays", value: stats.countries, emoji: "🌍" },
    { label: "Publications", value: stats.posts, emoji: "📸" },
    { label: "Likes reçus", value: stats.likes, emoji: "❤️" },
    { label: "Km parcourus", value: stats.distanceKm, emoji: "🛤️" },
    { label: "Carnets", value: stats.trips, emoji: "📓" },
    { label: "Reels", value: stats.reels, emoji: "🎬" },
  ];
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {items.map((i) => (
        <div
          key={i.label}
          className="rounded-2xl border border-border bg-card p-3 text-center shadow-soft"
        >
          <div className="text-lg">{i.emoji}</div>
          <p className="font-display text-lg font-semibold">{i.value.toLocaleString("fr-FR")}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{i.label}</p>
        </div>
      ))}
    </div>
  );
}

function BadgeCard({ b }: { b: ReturnType<typeof evaluateBadges>[number] }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(b.progress * 100));
    return () => cancelAnimationFrame(id);
  }, [b.progress]);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border p-3 shadow-soft transition ${
        b.unlocked ? "border-primary/40 bg-card hover:shadow-glow" : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl transition ${
            b.unlocked
              ? "bg-gradient-to-br from-amber-300 to-rose-400 text-white shadow-glow"
              : "bg-secondary text-muted-foreground grayscale"
          }`}
        >
          {b.unlocked ? b.emoji : <Lock className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{b.label}</p>
          <p className="line-clamp-2 text-[11px] text-muted-foreground">{b.description}</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-[width] duration-[1200ms] ease-out ${
              b.unlocked
                ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                : "bg-gradient-to-r from-primary/60 to-accent/60"
            }`}
            style={{ width: `${width}%` }}
          />
        </div>
        <p className="mt-1 text-right text-[10px] text-muted-foreground">
          {Math.min(b.value, b.target).toLocaleString("fr-FR")} / {b.target.toLocaleString("fr-FR")}
        </p>
      </div>
      {b.unlocked && (
        <span className="absolute right-2 top-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Débloqué
        </span>
      )}
    </div>
  );
}
