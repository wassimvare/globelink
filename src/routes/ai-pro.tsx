import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  CalendarDays,
  Check,
  Compass,
  Crown,
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
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createAiPlusCheckout } from "@/lib/ai-plus-checkout.functions";
import { askGlobeLinkPro, getAiProEntitlement } from "@/lib/ai-pro.functions";

const MODES = [
  { id: "research", label: "Rechercher", icon: Compass },
  { id: "compare", label: "Comparer", icon: Hotel },
  { id: "plan", label: "Organiser", icon: Wand2 },
  { id: "safety", label: "Vérifier", icon: ShieldCheck },
] as const;

type Mode = (typeof MODES)[number]["id"];
type BillingPlan = "monthly" | "annual";
type ThreadTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  updatedAt?: string;
};

const PREMIUM_FEATURES = [
  "Voyage complet jour par jour",
  "Comparaison hôtels, vols et activités",
  "Budget intelligent",
  "Carnet intelligent",
  "Modifications automatiques",
  "Assistant prioritaire",
];

const QUICK_PROMPTS = [
  "Optimise mon budget sans sacrifier les activités importantes.",
  "Compare les meilleurs quartiers où dormir pour mon voyage.",
  "Ajoute une activité originale et réorganise l’itinéraire.",
];

export const Route = createFileRoute("/ai-pro")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA+ — Agent de voyage premium" },
      { name: "description", content: "GlobeLink IA+ planifie, compare et organise ton voyage de A à Z." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AiPlusPage,
});

function friendlyAiError(error: Error) {
  if (error.message.includes("AI_PRO_SUBSCRIPTION_REQUIRED"))
    return "Un abonnement IA+ actif est nécessaire.";
  if (error.message.includes("AI_DAILY_LIMIT")) return "Ta limite IA+ du jour est atteinte.";
  return error.message || "IA+ n'a pas pu répondre.";
}

function AiPlusPage() {
  const { user } = useAuth();
  const entitlementFn = useServerFn(getAiProEntitlement);
  const askFn = useServerFn(askGlobeLinkPro);
  const checkoutFn = useServerFn(createAiPlusCheckout);
  const [billing, setBilling] = useState<BillingPlan>("monthly");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("plan");
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
    queryKey: ["ai-plus-current-trip", user?.id],
    enabled: !!user && hasAccess,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("id, title, country, budget, starts_on, ends_on, status")
        .eq("user_id", user!.id)
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
    onError: (error: Error) => toast.error(error.message || "Le paiement sécurisé n'a pas pu être ouvert."),
  });

  const research = useMutation({
    mutationFn: async (request: { query: string; mode: Mode }) => {
      if (!hasAccess) throw new Error("AI_PRO_SUBSCRIPTION_REQUIRED");
      return askFn({
        data: {
          query: request.query,
          mode: request.mode,
          history: turns.slice(-8).map(({ role, content }) => ({ role, content })),
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
          } satisfies ThreadTurn,
        ].slice(-12),
      );
      setQuery("");
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
        {user && entitlement.isLoading ? (
          <div className="surface-card grid min-h-[360px] place-items-center rounded-[2rem]">
            <div className="text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
              Vérification de ton accès IA+…
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
    <section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-violet-400/30 bg-card shadow-[0_32px_100px_-56px_rgba(124,58,237,.9)]">
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

          <div className="mt-6 text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Ton agent de voyage premium
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Planifie, compare et organise ton voyage de A à Z.
            </p>
          </div>

          <div className="mx-auto mt-7 max-w-2xl rounded-[1.75rem] border border-violet-400/35 bg-gradient-to-b from-violet-500/[0.16] to-background/70 p-5 sm:p-7">
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-violet-500/15 text-violet-400 shadow-[0_0_40px_-12px_rgba(139,92,246,.9)]">
                <Crown className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-violet-400 sm:text-xl">
                Profite de toute la puissance de l’IA+
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Un assistant intelligent qui s’occupe de chaque détail pour toi.
              </p>
            </div>

            <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
              {PREMIUM_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-500 text-slate-950">
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
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400">
                      Le plus rentable
                    </span>
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
                    <Sparkles className="mr-2 h-4 w-4" /> Essayer IA+
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
              Essai gratuit 7 jours • Sans engagement
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Annulable à tout moment</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Paiement sécurisé</span>
            </div>
          </div>
        </div>
      </div>
    </section>
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
  reset: () => void;
}) {
  const days = tripDuration(trip?.starts_on, trip?.ends_on);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="relative overflow-hidden rounded-[2rem] border border-violet-400/25 bg-card p-5 shadow-soft sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.10),transparent_35%),radial-gradient(circle_at_85%_5%,rgba(139,92,246,.15),transparent_36%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-bold text-primary">
              <Sparkles className="h-4 w-4" /> IA+ en action
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Ton agent de voyage premium</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Demande une modification, une comparaison ou une optimisation : IA+ garde le fil de ton voyage.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/15 px-3 py-1.5 text-xs font-bold text-violet-400">
            <Crown className="h-3.5 w-3.5" /> Premium actif
          </span>
        </div>
      </header>

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Voyage en cours</div>
                <h2 className="mt-1 font-display text-2xl font-bold">
                  {trip?.title || trip?.country || "Ton prochain voyage"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[
                    days ? `${days} jour${days > 1 ? "s" : ""}` : null,
                    trip?.budget ? `Budget : ${Number(trip.budget).toLocaleString("fr-FR")} €` : null,
                  ].filter(Boolean).join(" • ") || "Ajoute un voyage à ton carnet pour enrichir le contexte IA+."}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to={trip?.id ? "/trips/$id" : "/trips"} params={trip?.id ? { id: trip.id } : undefined as any}>
                  <Notebook className="mr-2 h-4 w-4" /> {trip?.id ? "Voir le résumé" : "Ouvrir mon carnet"}
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Comparaison intelligente</h2>
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => { setMode("compare"); setQuery("Compare les meilleures options d’hébergement pour mon voyage."); }} className="rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/30">
                <Hotel className="h-5 w-5 text-cyan-500" />
                <div className="mt-2 font-semibold">Hôtels</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Comparer les options</div>
              </button>
              <button type="button" onClick={() => { setMode("plan"); setQuery("Propose des activités adaptées à mon voyage et organise-les intelligemment."); }} className="rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/30">
                <Sparkles className="h-5 w-5 text-violet-400" />
                <div className="mt-2 font-semibold">Activités</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Enrichir l’itinéraire</div>
              </button>
              <button type="button" onClick={() => { setMode("compare"); setQuery("Optimise la répartition de mon budget de voyage."); }} className="rounded-2xl border border-border/70 bg-background/60 p-4 text-left transition hover:border-primary/30">
                <Wallet className="h-5 w-5 text-amber-500" />
                <div className="mt-2 font-semibold">Budget</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Optimiser les dépenses</div>
              </button>
            </div>
          </div>

          {turns.length > 0 && (
            <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <div className="font-display text-xl font-bold">Conseil IA+</div>
                <Button type="button" variant="ghost" size="sm" onClick={reset} className="rounded-xl">
                  <RotateCcw className="mr-2 h-3.5 w-3.5" /> Nouvelle
                </Button>
              </div>
              <div className="mt-4 space-y-4">
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <div key={turn.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground sm:max-w-[72%]">
                      {turn.content}
                    </div>
                  ) : (
                    <article key={turn.id} className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.08] to-background/60 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-violet-400">
                        <Sparkles className="h-3.5 w-3.5" /> Conseil IA+
                      </div>
                      <div className="md-body text-sm"><ReactMarkdown>{turn.content}</ReactMarkdown></div>
                    </article>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-[1.75rem] border border-border/70 bg-card p-4 shadow-soft sm:p-5">
            <div className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Itinéraire intelligent
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              IA+ peut réorganiser ton séjour, comparer les options et garder une marge dans ton budget.
            </p>
            <Button asChild variant="outline" className="mt-4 w-full rounded-xl">
              <Link to="/ai-trip"><Wand2 className="mr-2 h-4 w-4" /> Créer un itinéraire</Link>
            </Button>
          </div>

          <div className="rounded-[1.75rem] border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.10] to-card p-4 shadow-soft sm:p-5">
            <div className="flex items-center gap-2 font-semibold text-violet-400">
              <Sparkles className="h-4 w-4" /> Demande à IA+
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${active ? "border-violet-400/50 bg-violet-500/15 text-violet-300" : "border-border/70 bg-background/50 text-muted-foreground"}`}>
                    <Icon className="mb-1.5 h-4 w-4" /> {item.label}
                  </button>
                );
              })}
            </div>
            <Textarea
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 3_000))}
              placeholder="Demande une modification à l’IA+…"
              className="mt-3 min-h-28 resize-y rounded-2xl bg-background/65"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <Button type="button" onClick={send} disabled={query.trim().length < 4 || pending} className="mt-3 w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white">
              {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> IA+ réfléchit…</> : <><Send className="mr-2 h-4 w-4" /> Envoyer</>}
            </Button>
            <div className="mt-3 space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setQuery(prompt)} className="w-full rounded-xl border border-border/60 bg-background/45 px-3 py-2 text-left text-[11px] text-muted-foreground transition hover:border-primary/25 hover:text-foreground">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function tripDuration(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
}
