import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowRight,
  Check,
  Compass,
  Loader2,
  MapPinned,
  NotebookTabs,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { safeInternalPath } from "@/lib/auth-redirects";
import { toast } from "sonner";

const onboardingSearch = z.object({ next: z.string().optional() });

type OnboardingDestination = "/trips" | "/map" | "/match" | "/";

export const Route = createFileRoute("/_authenticated/onboarding")({
  ssr: false,
  validateSearch: onboardingSearch,
  head: () => ({
    meta: [
      { title: "Bienvenue sur GlobeLink" },
      {
        name: "description",
        content: "Découvre GlobeLink en quelques secondes et commence ton premier voyage.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const [finishing, setFinishing] = useState<OnboardingDestination | null>(null);

  const safeNext = useMemo(() => {
    const value = safeInternalPath(search.next);
    if (
      value === "/onboarding" ||
      value.startsWith("/onboarding?") ||
      value === "/auth" ||
      value.startsWith("/verify-email")
    ) {
      return "/";
    }
    return value;
  }, [search.next]);

  const profileQuery = useQuery({
    queryKey: ["onboarding-profile", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,username,display_name,onboarding_completed_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as
        | {
            id: string;
            username: string;
            display_name: string | null;
            onboarding_completed_at: string | null;
          }
        | null;
    },
  });

  useEffect(() => {
    if (!profileQuery.data?.onboarding_completed_at) return;
    navigate({ to: safeNext, replace: true });
  }, [navigate, profileQuery.data?.onboarding_completed_at, safeNext]);

  const firstName = useMemo(() => {
    const source = profileQuery.data?.display_name || profileQuery.data?.username || "";
    return source.trim().split(/\s+/)[0] || null;
  }, [profileQuery.data?.display_name, profileQuery.data?.username]);

  async function finish(destination: OnboardingDestination) {
    if (!user || finishing) return;
    setFinishing(destination);
    try {
      const completedAt = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update({ onboarding_completed_at: completedAt })
        .eq("id", user.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Profil GlobeLink introuvable");

      queryClient.setQueryData(["onboarding-profile", user.id], (current: any) =>
        current ? { ...current, onboarding_completed_at: completedAt } : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["auth-profile-status", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["my-profile", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["profile-nav", user.id] }),
      ]);

      const target = destination === "/" ? safeNext : destination;
      toast.success(destination === "/trips" ? "C’est parti pour ton premier voyage ✈️" : "Bienvenue sur GlobeLink !");
      navigate({ to: target, replace: true });
    } catch (error) {
      console.error("[GlobeLink onboarding] completion failed", error);
      toast.error("Impossible de terminer l’accueil. Réessaie dans un instant.");
      setFinishing(null);
    }
  }

  if (profileQuery.isLoading) {
    return (
      <OnboardingShell>
        <div className="grid min-h-[65vh] place-items-center text-center">
          <div>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Préparation de ton espace…</p>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <OnboardingShell>
        <div className="mx-auto flex min-h-[65vh] max-w-md flex-col items-center justify-center text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold">Ton profil se prépare encore</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            GlobeLink n’a pas encore pu charger ton profil. Rien n’est perdu.
          </p>
          <Button className="mt-6 rounded-2xl" onClick={() => profileQuery.refetch()}>
            Réessayer
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <main className="mx-auto flex w-full max-w-5xl flex-col py-5 sm:py-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-xs font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Bienvenue sur GlobeLink
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            {firstName ? `${firstName}, ` : ""}ton prochain voyage commence ici.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Pas de long questionnaire. Retient simplement trois choses : découvre, organise et rencontre des voyageurs au même endroit.
          </p>
        </div>

        <section className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
          <OnboardingFeature
            number="1"
            icon={Compass}
            title="Découvre"
            text="Explore des destinations, hôtels, restaurants et activités sur la carte."
          />
          <OnboardingFeature
            number="2"
            icon={NotebookTabs}
            title="Organise"
            text="Ajoute ce qui t’intéresse à ton voyage et retrouve tout dans ton carnet."
          />
          <OnboardingFeature
            number="3"
            icon={UsersRound}
            title="Rencontre"
            text="Trouve des voyageurs compatibles avec ta destination et tes dates."
          />
        </section>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-primary/12 via-card to-accent/10 p-5 shadow-soft sm:mt-6 sm:p-7">
          <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                <MapPinned className="h-4 w-4" /> Commence en 1 minute
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Crée ton premier voyage</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Choisis la destination et les dates. Ensuite, tout ce que tu trouveras dans Explorer pourra être ajouté à ce voyage.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-foreground/80">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> Gratuit</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> Modifiable à tout moment</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> IA disponible ensuite</span>
              </div>
            </div>
            <Button
              size="lg"
              disabled={!!finishing}
              onClick={() => finish("/trips")}
              className="h-12 rounded-2xl px-6 shadow-soft md:min-w-56"
            >
              {finishing === "/trips" ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookTabs className="h-4 w-4" />}
              Créer mon voyage
              {!finishing && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </section>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          <Button
            variant="outline"
            disabled={!!finishing}
            onClick={() => finish("/map")}
            className="h-11 rounded-2xl"
          >
            {finishing === "/map" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}
            Explorer d’abord
          </Button>
          <Button
            variant="outline"
            disabled={!!finishing}
            onClick={() => finish("/match")}
            className="h-11 rounded-2xl"
          >
            {finishing === "/match" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
            Voir Travel Match
          </Button>
          <Button
            variant="ghost"
            disabled={!!finishing}
            onClick={() => finish("/")}
            className="h-11 rounded-2xl sm:col-span-2 md:col-span-1"
          >
            {finishing === "/" && <Loader2 className="h-4 w-4 animate-spin" />}
            Passer pour l’instant
          </Button>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
          Tu peux modifier ton profil, tes préférences et tes voyages plus tard. Aucun choix ici n’est définitif.
        </p>
      </main>
    </OnboardingShell>
  );
}

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-background px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <div className="auth-ambient pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="relative mx-auto max-w-6xl">
        <div className="flex items-center justify-center gap-2.5 sm:justify-start">
          <div className="h-10 w-10 overflow-hidden rounded-xl shadow-soft">
            <BrandLogo className="h-full w-full" priority />
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-none">GlobeLink</div>
            <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Voyager ensemble</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function OnboardingFeature({
  number,
  icon: Icon,
  title,
  text,
}: {
  number: string;
  icon: typeof Compass;
  title: string;
  text: string;
}) {
  return (
    <article className="surface-card relative overflow-hidden rounded-[1.5rem] p-5 shadow-soft">
      <span className="absolute right-4 top-3 font-display text-4xl font-black text-primary/8">{number}</span>
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-4 font-display text-lg font-bold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}
