import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AIReadableAnswer } from "@/components/AIReadableAnswer";
// AI_READABLE_RESPONSE_V1
import { z } from "zod";
import {
  BookmarkPlus,
  CalendarDays,
  Check,
  CheckCircle2,
  Compass,
  Crown,
  Database,
  ExternalLink,
  Globe2,
  Hotel,
  Loader2,
  LockKeyhole,
  Notebook,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createAiPlusCheckout } from "@/lib/ai-plus-checkout.functions";
import {
  askGlobeLinkPro,
  getAiProEntitlement,
  saveAiPlusRecommendation,
} from "@/lib/ai-pro.functions";

const MODES = [
  { id: "research", label: "Rechercher", icon: Globe2 },
  { id: "compare", label: "Comparer", icon: Hotel },
  { id: "plan", label: "Organiser", icon: Wand2 },
  { id: "safety", label: "Vérifier", icon: ShieldCheck },
] as const;

type Mode = (typeof MODES)[number]["id"];
const aiProSearch = z.object({
  prompt: z.string().max(3_000).optional(),
  mode: z.enum(["research", "compare", "plan", "safety"]).optional(),
  tripId: z.string().uuid().optional(),
});
// AI_CONTEXT_LAYER_V1_PRO
type BillingPlan = "monthly" | "annual";
type Source = { title: string; url: string; snippet: string };
type ThreadTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  updatedAt?: string;
  sources?: Source[];
  liveSearch?: boolean;
  remaining?: number;
  applicationPreview?: { dayCount: number; budgetDayCount: number; days: string[]; totalForecast: number; actionable: boolean };
};

const PREMIUM_FEATURES = [
  "Recherche web et sources récentes",
  "Carnet GlobeLink connecté automatiquement",
  "Voyage complet et réorganisation intelligente",
  "Comparaisons détaillées avec verdict",
  "Budget analysé selon tes vraies dépenses",
  "250 demandes IA+ par jour par défaut",
];

const COMPARISON = [
  ["Conseils voyage", "Essentiels", "Approfondis et contextualisés"],
  ["Itinéraire", "Plan de départ", "Voyage complet et réorganisable"],
  ["Recherche web", "Non", "Oui, avec sources quand disponibles"],
  ["Carnet GlobeLink", "Non connecté", "Lu automatiquement par IA+"],
  ["Comparaisons", "Simples", "Tableaux, alternatives et verdict"],
  ["Budget", "Enveloppe indicative", "Budget restant + dépenses du carnet"],
  ["Quota chat", "40 / jour", "250 / jour par défaut"],
] as const;

const QUICK_PROMPTS = [
  "Analyse mon voyage enregistré et dis-moi ce que tu améliorerais en priorité.",
  "Compare les meilleurs quartiers où dormir avec avantages, limites et sources.",
  "Réorganise mon itinéraire pour réduire les trajets et préserver mon budget.",
  "Vérifie les points à risque ou à confirmer avant mon départ et propose des plans B.",
];

export const Route = createFileRoute("/ai-pro")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA+ — Agent de voyage premium" },
      {
        name: "description",
        content:
          "GlobeLink IA+ recherche, compare et organise ton voyage en utilisant ton carnet GlobeLink.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search) => aiProSearch.parse(search),
  component: AiPlusPage,
});

function friendlyAiError(error: Error) {
  const message = error.message || "";
  if (message.includes("AI_PRO_SUBSCRIPTION_REQUIRED"))
    return "Un abonnement IA+ actif est nécessaire.";
  if (message.includes("AI_DAILY_LIMIT")) return "Ta limite IA+ du jour est atteinte.";
  if (/429|resource_exhausted|rate.?limit/i.test(message))
    return "IA+ est temporairement très sollicitée. Une nouvelle tentative a déjà été faite automatiquement ; réessaie dans quelques instants.";
  if (/gemini api|délai|timeout|abort|fetch failed|network/i.test(message))
    return "L’analyse prend plus de temps que prévu. IA+ a déjà réessayé automatiquement ; réessaie dans un instant.";
  return message || "IA+ n'a pas pu répondre.";
}

function AiPlusPage() {
  const { prompt, mode: requestedMode, tripId } = Route.useSearch();
  const { user } = useAuth();
  const entitlementFn = useServerFn(getAiProEntitlement);
  const askFn = useServerFn(askGlobeLinkPro);
  const saveFn = useServerFn(saveAiPlusRecommendation);
  const checkoutFn = useServerFn(createAiPlusCheckout);
  const [billing, setBilling] = useState<BillingPlan>("annual");
  const [query, setQuery] = useState(prompt?.trim() || "");
  const [mode, setMode] = useState<Mode>(requestedMode ?? "plan");
  const [turns, setTurns] = useState<ThreadTurn[]>([]);

  const entitlement = useQuery({
    queryKey: ["ai-pro-entitlement", user?.id],
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
    queryFn: () => entitlementFn(),
  });
  const hasAccess = !!entitlement.data?.entitled;

  const tripQuery = useQuery({
    queryKey: ["ai-plus-current-trip", user?.id, tripId],
    enabled: !!user && hasAccess,
    staleTime: 60_000,
    queryFn: async () => {
      let request = supabase
        .from("trips")
        .select("id, title, city, country, budget, starts_on, ends_on, status")
        .eq("user_id", user!.id);
      if (tripId) request = request.eq("id", tripId);
      const { data, error } = await request
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const checkout = useMutation({
    mutationFn: (plan: BillingPlan) => checkoutFn({ data: { plan } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error: Error) =>
      toast.error(error.message || "Le paiement sécurisé n'a pas pu être ouvert."),
  });

  const research = useMutation({
    mutationFn: async (request: { query: string; mode: Mode }) => {
      if (!hasAccess) throw new Error("AI_PRO_SUBSCRIPTION_REQUIRED");
      return askFn({
        data: {
          query: request.query,
          mode: request.mode,
          history: turns.slice(-6).map(({ role, content }) => ({ role, content })),
          tripId: tripId || undefined,
        },
      });
    },
    onSuccess: (data, request) => {
      const stamp = Date.now();
      setTurns((current) =>
        [
          ...current,
          { id: `u-${stamp}`, role: "user", content: request.query } satisfies ThreadTurn,
          {
            id: `a-${stamp}`,
            role: "assistant",
            content: data.answer,
            updatedAt: data.updatedAt,
            sources: data.sources,
            liveSearch: data.liveSearch,
            remaining: data.remaining,
            applicationPreview: data.applicationPreview,
          } satisfies ThreadTurn,
        ].slice(-12),
      );
      setQuery("");
    },
    onError: (error: Error) => toast.error(friendlyAiError(error)),
  });

  const save = useMutation({
    mutationFn: async (turn: ThreadTurn) => {
      if (!tripQuery.data?.id) throw new Error("Ajoute d'abord un voyage à ton carnet.");
      return saveFn({
        data: {
          tripId: tripQuery.data.id,
          title: "Conseil enregistré depuis IA+",
          content: turn.content,
        },
      });
    },
    onSuccess: (result) => {
      const details = [
        result.appliedDays ? `${result.appliedDays} journée${result.appliedDays > 1 ? "s" : ""}` : null,
        result.appliedBudgetDays ? `${result.appliedBudgetDays} budget${result.appliedBudgetDays > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" + ");
      toast.success(details ? `IA+ a appliqué ${details} au carnet ✨` : "Conseil IA+ enregistré dans ton carnet ✨");
    },
    onError: (error: Error) => toast.error(friendlyAiError(error)),
  });

  const send = () => {
    const message = query.trim();
    if (!hasAccess || message.length < 4 || research.isPending) return;
    research.mutate({ query: message, mode });
  };

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-24 pt-4 sm:pt-7">
        {/* JOURNEY_CONTINUITY_V1_AI_PRO */}
        {tripId && (
          <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] to-cyan-500/[0.05] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-500">Voyage connecté</p>
              <p className="mt-1 truncate text-sm font-semibold">
                IA+ travaille sur {tripQuery.data?.title ?? "ce carnet précis"}.
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Le contexte du voyage reste sélectionné pendant cette session.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0 rounded-full">
              <Link to="/trips/$id" params={{ id: tripId }}>
                <Notebook className="mr-2 h-4 w-4" /> Retour au carnet
              </Link>
            </Button>
          </section>
        )}

        {user && entitlement.isLoading ? (
          <div className="surface-card grid min-h-[360px] place-items-center rounded-[2rem]">
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
              Connexion de ton espace IA+…
            </div>
          </div>
        ) : hasAccess ? (
          <PremiumWorkspace
            trip={tripQuery.data}
            mode={mode}
            setMode={setMode}
            query={query}
            setQuery={setQuery}
            turns={turns}
            send={send}
            pending={research.isPending}
            savePending={save.isPending}
            saveTurn={(turn) => save.mutate(turn)}
            reset={() => {
              setTurns([]);
              setQuery("");
            }}
          />
        ) : (
          <UpgradeScreen
            user={user}
            billing={billing}
            setBilling={setBilling}
            checkout={() => checkout.mutate(billing)}
            checkoutPending={checkout.isPending}
          />
        )}
      </main>
    </div>
  );
}

function UpgradeScreen({
  user,
  billing,
  setBilling,
  checkout,
  checkoutPending,
}: {
  user: unknown;
  billing: BillingPlan;
  setBilling: (plan: BillingPlan) => void;
  checkout: () => void;
  checkoutPending: boolean;
}) {
  return (
    <section className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-violet-400/30 bg-card shadow-[0_32px_100px_-56px_rgba(124,58,237,.9)]">
      <div className="relative p-5 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,.20),transparent_34%),radial-gradient(circle_at_90%_15%,rgba(34,211,238,.10),transparent_28%)]" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-sm font-bold">
              <Sparkles className="h-4 w-4 text-primary" /> GlobeLink IA+
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-400 shadow-[0_0_28px_-10px_rgba(139,92,246,.9)]">
              <Crown className="h-3.5 w-3.5" /> Premium
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-3xl text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Passe d’un assistant à un vrai agent de voyage IA.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              IA+ ne se contente pas de donner des idées : il utilise ton carnet, recherche des informations récentes, compare les options et adapte ses recommandations à ton budget réel.
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Benefit icon={Globe2} title="Recherche récente" text="Sources web et informations à vérifier directement." />
            <Benefit icon={Database} title="Carnet connecté" text="Ton voyage, tes journées et tes dépenses servent de contexte." />
            <Benefit icon={Hotel} title="Comparaisons" text="Options, avantages, limites et verdict clair." />
            <Benefit icon={Zap} title="Beaucoup plus d'usage" text="250 demandes IA+ par jour par défaut." />
          </div>

          <div className="mt-7 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/55">
            <div className="grid grid-cols-[1.2fr_.8fr_1fr] border-b border-border/70 bg-secondary/30 px-4 py-3 text-xs font-bold uppercase tracking-wider sm:px-5">
              <span>Fonction</span>
              <span className="text-center">Gratuit</span>
              <span className="text-center text-violet-400">IA+</span>
            </div>
            {COMPARISON.map(([feature, free, plus]) => (
              <div key={feature} className="grid grid-cols-[1.2fr_.8fr_1fr] items-center border-b border-border/50 px-4 py-3 text-xs last:border-0 sm:px-5 sm:text-sm">
                <span className="font-medium">{feature}</span>
                <span className="text-center text-muted-foreground">{free}</span>
                <span className="text-center font-semibold text-violet-300">{plus}</span>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-7 max-w-2xl rounded-[1.75rem] border border-violet-400/35 bg-gradient-to-b from-violet-500/[0.16] to-background/70 p-5 sm:p-7">
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet-500/15 text-violet-400 shadow-[0_0_40px_-12px_rgba(139,92,246,.9)]">
                <Crown className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-violet-400 sm:text-xl">
                Toute la puissance de GlobeLink IA+
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Le niveau conçu pour préparer et ajuster un vrai voyage, pas seulement trouver des idées.
              </p>
            </div>

            <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
              {PREMIUM_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-500 text-slate-950">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="mt-7 space-y-2.5">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${billing === "monthly" ? "border-cyan-400/65 bg-cyan-500/[0.08] shadow-[0_0_30px_-18px_rgba(34,211,238,.8)]" : "border-border/70 bg-background/55"}`}
              >
                <span className={`h-5 w-5 rounded-full border-2 p-1 ${billing === "monthly" ? "border-cyan-400" : "border-muted-foreground/50"}`}>
                  {billing === "monthly" && <span className="block h-full w-full rounded-full bg-cyan-400" />}
                </span>
                <span className="flex-1 font-semibold">Mensuel</span>
                <span className="font-semibold">7,99 €/mois</span>
              </button>

              <button
                type="button"
                onClick={() => setBilling("annual")}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${billing === "annual" ? "border-cyan-400/65 bg-cyan-500/[0.08] shadow-[0_0_30px_-18px_rgba(34,211,238,.8)]" : "border-border/70 bg-background/55"}`}
              >
                <span className={`h-5 w-5 rounded-full border-2 p-1 ${billing === "annual" ? "border-cyan-400" : "border-muted-foreground/50"}`}>
                  {billing === "annual" && <span className="block h-full w-full rounded-full bg-cyan-400" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    Annuel
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400">Le plus rentable</span>
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold">59,99 €/an</span>
                  <span className="block text-[10px] text-muted-foreground">Soit 5,00 €/mois</span>
                </span>
              </button>
            </div>

            {user ? (
              <Button
                type="button"
                size="lg"
                onClick={checkout}
                disabled={checkoutPending}
                className="mt-5 h-13 w-full rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 text-white shadow-[0_14px_45px_-20px_rgba(99,102,241,.9)] hover:opacity-95"
              >
                {checkoutPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ouverture du paiement…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Passer à IA+ — 7 jours gratuits
                  </>
                )}
              </Button>
            ) : (
              <Button asChild size="lg" className="mt-5 h-13 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white">
                <Link to="/auth">
                  <LockKeyhole className="mr-2 h-4 w-4" /> Se connecter pour essayer IA+
                </Link>
              </Button>
            )}

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Essai gratuit 7 jours • Sans engagement • Annulable à tout moment
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefit({ icon: Icon, title, text }: { icon: typeof Globe2; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
      <Icon className="h-5 w-5 text-violet-400" />
      <div className="mt-2 font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function PremiumWorkspace({
  trip,
  mode,
  setMode,
  query,
  setQuery,
  turns,
  send,
  pending,
  savePending,
  saveTurn,
  reset,
}: {
  trip: any;
  mode: Mode;
  setMode: (mode: Mode) => void;
  query: string;
  setQuery: (value: string) => void;
  turns: ThreadTurn[];
  send: () => void;
  pending: boolean;
  savePending: boolean;
  saveTurn: (turn: ThreadTurn) => void;
  reset: () => void;
}) {
  const days = tripDuration(trip?.starts_on, trip?.ends_on);
  const latestAssistant = [...turns].reverse().find((turn) => turn.role === "assistant");
  const queryInputRef = useRef<HTMLTextAreaElement>(null);

  const fillPrompt = (value: string) => {
    setQuery(value);
    requestAnimationFrame(() => {
      if (!queryInputRef.current) return;
      queryInputRef.current.scrollTop = 0;
      queryInputRef.current.focus();
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="relative overflow-hidden rounded-[2rem] border border-violet-400/25 bg-card p-5 shadow-soft sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.10),transparent_35%),radial-gradient(circle_at_85%_5%,rgba(139,92,246,.15),transparent_36%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <Sparkles className="h-4 w-4" /> IA+ en action
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Ton voyage devient le contexte de l’IA.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              IA+ lit ton dernier voyage enregistré, tient compte de tes journées et de tes dépenses, puis combine ce contexte avec ses recherches pour te donner une réponse plus utile qu’un simple conseil générique.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-400">
            <Crown className="h-3.5 w-3.5" /> Premium actif
          </span>
        </div>

        <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
          <StatusPill icon={Database} title="Carnet connecté" text={trip?.id ? "Voyage chargé automatiquement" : "Ajoute un voyage pour l'activer"} />
          <StatusPill icon={Globe2} title="Recherche web" text={latestAssistant?.liveSearch ? "Sources trouvées sur la dernière réponse" : "Activée quand des sources sont disponibles"} />
          <StatusPill icon={Zap} title="Quota IA+" text={latestAssistant?.remaining != null ? `${latestAssistant.remaining} demandes restantes aujourd'hui` : "250 demandes / jour par défaut"} />
        </div>
      </header>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contexte utilisé par IA+</div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  {trip?.title || trip?.country || "Aucun voyage enregistré"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    [trip?.city, trip?.country].filter(Boolean).join(", ") || null,
                    days ? `${days} jour${days > 1 ? "s" : ""}` : null,
                    trip?.budget ? `Budget : ${Number(trip.budget).toLocaleString("fr-FR")} €` : null,
                  ].filter(Boolean).join(" • ") || "Ajoute un voyage à ton carnet pour que IA+ personnalise réellement ses décisions."}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to={trip?.id ? "/trips/$id" : "/trips"} params={trip?.id ? { id: trip.id } : undefined as any}>
                  <Notebook className="mr-2 h-4 w-4" /> {trip?.id ? "Voir le carnet" : "Créer mon carnet"}
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Actions premium</h2>
                <p className="mt-1 text-xs text-muted-foreground">Des demandes conçues pour exploiter le contexte réel de ton voyage.</p>
              </div>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <ActionCard icon={Database} title="Auditer mon voyage" text="Analyse le carnet et trouve les points faibles." onClick={() => { setMode("research"); fillPrompt("Analyse tout mon voyage enregistré et donne-moi les 5 améliorations les plus importantes, avec leur impact concret."); }} />
              <ActionCard icon={Hotel} title="Comparer avec sources" text="Hôtels, quartiers ou options selon mes critères." onClick={() => { setMode("compare"); fillPrompt("Compare les meilleures options d’hébergement pour mon voyage avec des sources récentes, puis recommande celle qui correspond le mieux à mon budget et à mon itinéraire."); }} />
              <ActionCard icon={Wand2} title="Réorganiser le séjour" text="Réduit les trajets et améliore le rythme." onClick={() => { setMode("plan"); fillPrompt("Réorganise mon voyage enregistré pour réduire les trajets inutiles, garder un bon rythme et respecter mon budget. Explique précisément ce que tu changerais dans le carnet."); }} />
              <ActionCard icon={ShieldCheck} title="Vérifier avant départ" text="Risques, horaires, conditions et plans B." onClick={() => { setMode("safety"); fillPrompt("Vérifie les points importants de mon voyage avant le départ : risques, horaires ou conditions à confirmer, réservations sensibles et plans B."); }} />
            </div>
          </div>

          {turns.length > 0 && (
            <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div>
                  <div className="font-display text-xl font-bold">Conversation IA+</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Les réponses premium peuvent utiliser le carnet et des sources web.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={reset} className="rounded-xl">
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Nouvelle
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <div key={turn.id} className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground sm:max-w-[75%]">
                      {turn.content}
                    </div>
                  ) : (
                    <article key={turn.id} className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.08] to-background/60 p-4 sm:p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-violet-400">
                          <Sparkles className="h-3.5 w-3.5" /> Conseil IA+
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {turn.liveSearch ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-500"><Globe2 className="h-3 w-3" /> Sources web utilisées</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1"><Compass className="h-3 w-3" /> Analyse IA+</span>
                          )}
                        </div>
                      </div>
                      <AIReadableAnswer content={turn.content} />

                      {turn.sources && turn.sources.length > 0 && (
                        <div className="mt-5 border-t border-border/60 pt-4">
                          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Sources consultées</div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {turn.sources.slice(0, 6).map((source, index) => (
                              <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="group rounded-xl border border-border/70 bg-background/55 p-3 transition hover:border-primary/30">
                                <div className="flex items-start gap-2">
                                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <div className="line-clamp-1 text-xs font-semibold group-hover:text-primary">{source.title}</div>
                                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{source.snippet}</div>
                                  </div>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <span className="text-[10px] text-muted-foreground">
                          {turn.remaining != null ? `${turn.remaining} demandes IA+ restantes aujourd'hui` : "Réponse premium"}
                        </span>
                        {trip?.id && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {turn.applicationPreview?.actionable && (
                              <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-400">
                                {turn.applicationPreview.dayCount > 0 ? turn.applicationPreview.dayCount + " jour" + (turn.applicationPreview.dayCount > 1 ? "s" : "") : ""}
                                {turn.applicationPreview.dayCount > 0 && turn.applicationPreview.budgetDayCount > 0 ? " · " : ""}
                                {turn.applicationPreview.budgetDayCount > 0 ? "budget " + turn.applicationPreview.totalForecast.toFixed(2) + " €" : ""}
                              </span>
                            )}
                            <Button type="button" variant={turn.applicationPreview?.actionable ? "default" : "outline"} size="sm" disabled={savePending} onClick={() => saveTurn(turn)} className="rounded-xl">
                              {savePending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="mr-2 h-3.5 w-3.5" />}
                              {turn.applicationPreview?.actionable ? "Appliquer au carnet" : "Enregistrer le conseil"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-[1.75rem] border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.10] to-card p-4 shadow-soft sm:p-5" aria-busy={pending}>
            <div className="flex items-center gap-2 font-semibold text-violet-400">
              <Sparkles className="h-4 w-4" /> Demande à IA+
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button key={item.id} type="button" disabled={pending} onClick={() => setMode(item.id)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-violet-400/50 bg-violet-500/15 text-violet-300" : "border-border/70 bg-background/50 text-muted-foreground"}`}>
                    <Icon className="mb-1.5 h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              ref={queryInputRef}
              rows={4}
              value={query}
              disabled={pending}
              onChange={(event) => setQuery(event.target.value.slice(0, 3_000))}
              placeholder="Ex. Réorganise mon voyage en gardant 300 € de marge…"
              className="mt-3 min-h-[96px] max-h-[144px] resize-none overflow-y-auto rounded-2xl bg-background/65 leading-relaxed"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <Button type="button" onClick={send} disabled={query.trim().length < 4 || pending} className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white">
              {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> IA+ analyse le voyage…</> : <><Send className="mr-2 h-4 w-4" /> Lancer l’analyse IA+</>}
            </Button>
            {pending && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.08] px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-violet-400" />
                <span>Analyse en cours. IA+ réessaie automatiquement si le moteur tarde à répondre.</span>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" disabled={pending} onClick={() => fillPrompt(prompt)} className="w-full rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition hover:border-primary/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60">
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Ce que IA+ fait différemment
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <li>• utilise automatiquement le dernier voyage de ton carnet ;</li>
              <li>• tient compte de tes dépenses déjà enregistrées ;</li>
              <li>• peut rechercher et citer des sources récentes ;</li>
              <li>• compare plusieurs options au lieu de donner une seule idée ;</li>
              <li>• peut appliquer son programme et ses budgets directement dans les bonnes journées du carnet.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}

function StatusPill({ icon: Icon, title, text }: { icon: typeof Database; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/55 p-3">
      <div className="flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4 text-violet-400" /> {title}</div>
      <p className="mt-1 text-[10px] text-muted-foreground">{text}</p>
    </div>
  );
}

function ActionCard({ icon: Icon, title, text, onClick }: { icon: typeof Database; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/30 hover:bg-secondary/40">
      <Icon className="h-5 w-5 text-violet-400" />
      <div className="mt-2 font-semibold">{title}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text}</div>
    </button>
  );
}

function tripDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}
