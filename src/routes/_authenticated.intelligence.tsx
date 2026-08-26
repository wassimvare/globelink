import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Check,
  Crown,
  Database,
  Globe2,
  Hotel,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getAiProEntitlement } from "@/lib/ai-pro.functions";

export const Route = createFileRoute("/_authenticated/intelligence")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA — Choisir ton assistant" },
      {
        name: "description",
        content:
          "Choisis entre GlobeLink IA gratuit pour trouver des idées et IA+ pour rechercher, comparer et organiser ton voyage avec ton carnet.",
      },
    ],
  }),
  component: IntelligencePage,
});

const FREE_FEATURES = [
  "Questions et conseils rapides",
  "Idées de destinations",
  "Exemple de journée",
  "Conseils généraux sur le budget et l’organisation",
  "40 demandes de chat par jour",
];

const PRO_FEATURES = [
  "Analyse de ton voyage et de ton carnet",
  "Recherche de vrais hôtels, restaurants et activités",
  "Comparaison des options et des prix",
  "Itinéraire complet jour par jour",
  "Recommandations adaptées à tes dates, ton budget et tes préférences",
  "Ajustements du voyage pendant la préparation",
];

function IntelligencePage() {
  const { user } = useAuth();
  const entitlementFn = useServerFn(getAiProEntitlement);

  const entitlement = useQuery({
    queryKey: ["ai-pro-entitlement", user?.id],
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
    queryFn: () => entitlementFn(),
  });
  const hasPlus = !!entitlement.data?.entitled;

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-24 pt-4 sm:pt-7">
        <header className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(75,217,230,0.12),transparent_35%),radial-gradient(circle_at_88%_12%,rgba(139,92,246,0.15),transparent_32%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              <Sparkles className="h-4 w-4" /> GlobeLink IA
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Ton assistant voyage
            </h1>
            <p className="mx-auto mt-2 text-sm font-semibold text-foreground/80 sm:text-base">
              Choisis la version qui correspond à ton besoin.
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Une version gratuite pour t’inspirer, et IA+ pour rechercher de vraies options, comparer et organiser ton voyage avec beaucoup plus de contexte.
            </p>
          </div>

          <div className="relative mx-auto mt-7 grid max-w-5xl gap-4 lg:grid-cols-[.9fr_1.1fr]">
            <section className="rounded-[1.75rem] border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.08] to-background/80 p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-500">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xl font-bold text-cyan-500">Gratuit</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Pour t’inspirer et préparer les grandes lignes.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                {FREE_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-border/60 bg-background/55 p-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Ce que le gratuit ne fait pas :</strong> il ne consulte pas ton carnet et ne recherche pas les prix, disponibilités ou établissements en temps réel.
              </div>

              <Button asChild variant="outline" className="mt-5 w-full rounded-2xl border-cyan-400/30">
                <Link to="/ai-trip">
                  <Wand2 className="mr-2 h-4 w-4" /> Utiliser l’IA gratuite
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </section>

            <section className="relative overflow-hidden rounded-[1.75rem] border border-violet-400/40 bg-gradient-to-br from-violet-500/[0.20] via-background/85 to-cyan-500/[0.10] p-5 shadow-[0_24px_80px_-45px_rgba(139,92,246,.85)] sm:p-6">
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-500/20 text-violet-400">
                    <Crown className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-2xl font-bold text-violet-400">IA+</div>
                      {hasPlus ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                          Actif
                        </span>
                      ) : (
                        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                          Premium
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Pour organiser réellement ton voyage avec des données et du contexte.
                    </p>
                  </div>
                </div>
                <Sparkles className="h-5 w-5 text-violet-400" />
              </div>

              <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
                <PremiumMini icon={Globe2} title="Recherche réelle" text="Hôtels, restaurants et activités" />
                <PremiumMini icon={Database} title="Carnet connecté" text="Voyage, journées et dépenses" />
                <PremiumMini icon={Hotel} title="Comparaisons" text="Options, prix et verdict clair" />
                <PremiumMini icon={Zap} title="250 demandes/jour" text="Usage bien plus confortable" />
              </div>

              <div className="relative mt-5 space-y-2.5">
                {PRO_FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <Button asChild className="relative mt-6 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 text-white shadow-lg shadow-violet-500/20 hover:opacity-95">
                <Link to="/ai-pro">
                  <Crown className="mr-2 h-4 w-4" /> {hasPlus ? "Ouvrir IA+" : "Découvrir IA+ — 7 jours gratuits"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </section>
          </div>
        </header>
      </main>
    </div>
  );
}

function PremiumMini({ icon: Icon, title, text }: { icon: typeof Globe2; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-violet-400/15 bg-background/45 p-3">
      <Icon className="h-4 w-4 text-violet-400" />
      <div className="mt-1.5 text-xs font-semibold">{title}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{text}</div>
    </div>
  );
}
