import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  Check,
  Compass,
  Crown,
  Database,
  Globe2,
  Hotel,
  Loader2,
  LockKeyhole,
  MapPin,
  Plane,
  Send,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { askGlobeLinkFree } from "@/lib/ai-free.functions";
import { getAiProEntitlement } from "@/lib/ai-pro.functions";

export const Route = createFileRoute("/_authenticated/intelligence")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA — Ton assistant voyage" },
      {
        name: "description",
        content:
          "GlobeLink IA aide gratuitement à cadrer un voyage, tandis que IA+ recherche, compare et utilise le carnet GlobeLink.",
      },
    ],
  }),
  component: IntelligencePage,
});

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const FREE_FEATURES = [
  "Questions et conseils rapides",
  "Idées de destinations",
  "Plan de départ et journée exemple",
  "Suggestions générales d’hôtels, restaurants et activités",
  "40 demandes de chat par jour",
];

const PRO_FEATURES = [
  "Recherche web et sources récentes",
  "Carnet GlobeLink connecté automatiquement",
  "Voyage complet et réorganisation intelligente",
  "Comparaison détaillée avec verdict",
  "Budget analysé avec les dépenses enregistrées",
  "250 demandes par jour par défaut",
];

const SUGGESTIONS = [
  {
    label: "Préparer un voyage",
    sublabel: "Obtenir un plan de départ gratuit",
    icon: Plane,
    href: "/ai-trip",
  },
  {
    label: "Trouver une destination",
    sublabel: "Selon ton budget et tes envies",
    icon: MapPin,
    prompt: "Aide-moi à trouver une destination selon mon budget, mes envies et la période de voyage.",
  },
  {
    label: "Que faire sur place ?",
    sublabel: "Quelques idées pour commencer",
    icon: Compass,
    prompt: "Donne-moi des idées de choses à faire sur ma prochaine destination.",
  },
  {
    label: "Comparer des hôtels avec sources",
    sublabel: "Fonction IA+",
    icon: Hotel,
    href: "/ai-pro",
    premium: true,
  },
] as const;

function IntelligencePage() {
  const { user } = useAuth();
  const entitlementFn = useServerFn(getAiProEntitlement);
  const askFreeFn = useServerFn(askGlobeLinkFree);
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

  const entitlement = useQuery({
    queryKey: ["ai-pro-entitlement", user?.id],
    enabled: !!user,
    retry: 1,
    staleTime: 60_000,
    queryFn: () => entitlementFn(),
  });
  const hasPlus = !!entitlement.data?.entitled;

  const assistant = useMutation({
    mutationFn: async (message: string) =>
      askFreeFn({
        data: {
          query: message,
          history: turns.slice(-6).map(({ role, content }) => ({ role, content })),
        },
      }),
    onSuccess: (data, message) => {
      const stamp = Date.now();
      setTurns((current) =>
        [
          ...current,
          { id: `u-${stamp}`, role: "user", content: message } satisfies ChatTurn,
          { id: `a-${stamp}`, role: "assistant", content: data.answer } satisfies ChatTurn,
        ].slice(-10),
      );
      setRemaining(data.remaining);
      setQuery("");
    },
    onError: (error: Error) => toast.error(error.message || "GlobeLink IA n'a pas pu répondre."),
  });

  const send = () => {
    const message = query.trim();
    if (message.length < 3 || assistant.isPending) return;
    assistant.mutate(message);
  };

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
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Commence gratuitement pour trouver des idées. Passe à IA+ quand tu veux que GlobeLink analyse ton vrai voyage, recherche des options et t’aide à prendre des décisions plus précises.
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
                  <p className="mt-0.5 text-sm text-muted-foreground">Pour chercher une idée et cadrer rapidement un voyage.</p>
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
                <strong className="text-foreground">Limite du mode gratuit :</strong> il ne consulte pas ton carnet, ne fait pas de comparaison web approfondie et te donne un plan de départ plutôt qu’un voyage entièrement orchestré.
              </div>
              <Button asChild variant="outline" className="mt-5 w-full rounded-2xl border-cyan-400/30">
                <Link to="/ai-trip">
                  <Wand2 className="mr-2 h-4 w-4" /> Créer mon plan de départ
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
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500">Actif</span>
                      ) : (
                        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">Premium</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Pour organiser un vrai voyage avec beaucoup plus de contexte.
                    </p>
                  </div>
                </div>
                <Sparkles className="h-5 w-5 text-violet-400" />
              </div>

              <div className="relative mt-5 grid gap-2 sm:grid-cols-2">
                <PremiumMini icon={Globe2} title="Recherche récente" text="Sources web quand disponibles" />
                <PremiumMini icon={Database} title="Carnet connecté" text="Voyage, journées et dépenses" />
                <PremiumMini icon={Hotel} title="Vraies comparaisons" text="Options + verdict clair" />
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
                </Link>
              </Button>
            </section>
          </div>
        </header>

        <section className="mx-auto mt-5 max-w-5xl rounded-[2rem] border border-border/70 bg-card p-4 shadow-soft sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow">
                <Sparkles className="h-3.5 w-3.5" /> Assistant gratuit
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold">Que veux-tu savoir ?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Pour une question rapide, le mode gratuit reste disponible ici.</p>
            </div>
            {remaining !== null && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                {remaining} demande{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} aujourd’hui
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((item) => {
              const Icon = item.icon;
              if ("href" in item) {
                return (
                  <Link key={item.label} to={item.href} className={`group flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${"premium" in item && item.premium ? "border-violet-400/25 bg-violet-500/[0.07] hover:border-violet-400/45" : "border-border/70 bg-background/65 hover:border-primary/30 hover:bg-secondary/50"}`}>
                    <Icon className={`h-4 w-4 ${"premium" in item && item.premium ? "text-violet-400" : "text-primary"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{item.sublabel}</span>
                    </span>
                    {"premium" in item && item.premium ? <LockKeyhole className="h-4 w-4 text-violet-400" /> : <span className="text-muted-foreground transition group-hover:translate-x-0.5">→</span>}
                  </Link>
                );
              }
              return (
                <button key={item.label} type="button" onClick={() => setQuery(item.prompt)} className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/65 px-4 py-3 text-left text-sm transition hover:border-primary/30 hover:bg-secondary/50">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{item.sublabel}</span>
                  </span>
                  <span className="text-muted-foreground transition group-hover:translate-x-0.5">→</span>
                </button>
              );
            })}
          </div>

          {turns.length > 0 && (
            <div className="mt-5 space-y-3 rounded-[1.5rem] border border-border/60 bg-background/55 p-3 sm:p-4">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground sm:max-w-[72%]">
                    {turn.content}
                  </div>
                ) : (
                  <article key={turn.id} className="max-w-[96%] rounded-2xl rounded-bl-md border border-primary/15 bg-card p-4 text-sm leading-relaxed sm:max-w-[84%]">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> GlobeLink IA · Gratuit
                    </div>
                    <div className="md-body"><ReactMarkdown>{turn.content}</ReactMarkdown></div>
                    {!hasPlus && (
                      <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
                        Besoin d’une comparaison avec sources, d’un plan complet ou d’une analyse de ton carnet ? <Link to="/ai-pro" className="font-semibold text-violet-400 hover:underline">IA+ est conçu pour ça.</Link>
                      </div>
                    )}
                  </article>
                ),
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border/80 bg-background/75 p-2 focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 1_200))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Pose une question rapide à GlobeLink IA…"
              className="h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="button" size="icon" onClick={send} disabled={query.trim().length < 3 || assistant.isPending} className="h-11 w-11 shrink-0 rounded-xl" aria-label="Envoyer à GlobeLink IA">
              {assistant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            GlobeLink IA peut faire des erreurs. Vérifie les informations importantes avant de réserver.
          </p>
        </section>
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
