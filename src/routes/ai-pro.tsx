import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  BookOpen,
  Check,
  Clock3,
  Compass,
  Crown,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { askGlobeLinkPro, createAiProCheckout, getAiProEntitlement } from "@/lib/ai-pro.functions";

const MODES = [
  { id: "research", label: "Comprendre", icon: Search, description: "Synthèse claire et pratique" },
  { id: "compare", label: "Comparer", icon: BookOpen, description: "Avantages, limites et budget" },
  { id: "plan", label: "Organiser", icon: Wand2, description: "Étapes et itinéraire concret" },
  { id: "safety", label: "Vérifier", icon: ShieldCheck, description: "Risques et précautions" },
] as const;

type ThreadTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  updatedAt?: string;
};

const PROMPTS = [
  "Compare 10 jours au Japon et en Corée du Sud avec 1 800 € par personne.",
  "Prépare un itinéraire calme de 8 jours à Bali, loin des zones trop touristiques.",
  "Quelles précautions vérifier avant un road trip en Indonésie ?",
];

export const Route = createFileRoute("/ai-pro")({
  head: () => ({
    meta: [
      { title: "GlobeLink AI Pro" },
      { name: "description", content: "Le conseiller voyage premium de GlobeLink." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AiProPage,
});

function friendlyAiError(error: Error) {
  if (error.message.includes("AI_PRO_SUBSCRIPTION_REQUIRED"))
    return "Un abonnement AI Pro actif est nécessaire.";
  if (error.message.includes("AI_DAILY_LIMIT")) return "Ta limite AI Pro du jour est atteinte.";
  return error.message || "Le conseiller n'a pas pu répondre.";
}

function AiProPage() {
  const { user } = useAuth();
  const entitlementFn = useServerFn(getAiProEntitlement);
  const askFn = useServerFn(askGlobeLinkPro);
  const checkoutFn = useServerFn(createAiProCheckout);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("research");
  const [turns, setTurns] = useState<ThreadTurn[]>([]);

  const entitlement = useQuery({
    queryKey: ["ai-pro-entitlement", user?.id],
    enabled: !!user,
    retry: 1,
    queryFn: () => entitlementFn(),
  });
  const hasAccess = !!entitlement.data?.entitled;

  const checkout = useMutation({
    mutationFn: () => checkoutFn({ data: {} }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error: Error) =>
      toast.error(error.message || "Le paiement sécurisé n'a pas pu être ouvert."),
  });

  const research = useMutation({
    mutationFn: async (request: { query: string; mode: (typeof MODES)[number]["id"] }) => {
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

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-20 pt-4 sm:pt-7">
        <header className="travel-assistant-hero surface-card overflow-hidden p-5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div className="max-w-3xl">
              <div className="eyebrow">
                <Crown className="h-4 w-4" /> GlobeLink AI Pro
              </div>
              <h1 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight sm:text-5xl">
                Un conseiller premium pour préparer ton prochain départ.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                L'accès est vérifié côté serveur à chaque demande. Un compte connecté sans
                abonnement ne peut plus utiliser AI Pro.
              </p>
            </div>
            <div className="assistant-note rounded-2xl border border-border/70 bg-background/75 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Check className="h-4 w-4 text-emerald-600" /> Accès protégé
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {entitlement.data?.isStaff
                  ? "Accès équipe GlobeLink."
                  : entitlement.data?.subscribed
                    ? "Abonnement AI Pro actif."
                    : "Abonnement requis pour envoyer une demande."}
              </p>
            </div>
          </div>
        </header>

        {!user && (
          <section className="surface-card mt-5 p-6 text-center">
            <LockKeyhole className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 font-display text-2xl font-bold">
              Connecte-toi pour vérifier ton abonnement
            </h2>
            <Button asChild className="mt-5 rounded-xl">
              <Link to="/auth">Se connecter</Link>
            </Button>
          </section>
        )}

        {user && !entitlement.isLoading && !hasAccess && (
          <section className="surface-card mt-5 border-primary/25 p-6 sm:p-8">
            <div className="mx-auto max-w-2xl text-center">
              <Crown className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-3 font-display text-2xl font-bold">
                AI Pro nécessite un abonnement actif
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Le simple fait d'être connecté ou d'avoir une valeur « pro » dans le profil ne
                débloque plus l'outil. Seul un abonnement Stripe actif, une période d'essai valide
                ou un compte de l'équipe GlobeLink est accepté par le serveur.
              </p>
              <Button
                onClick={() => checkout.mutate()}
                disabled={checkout.isPending}
                size="lg"
                className="mt-5 rounded-xl"
              >
                {checkout.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ouverture du paiement…
                  </>
                ) : (
                  <>
                    <Crown className="mr-2 h-4 w-4" />
                    S'abonner à AI Pro
                  </>
                )}
              </Button>
            </div>
          </section>
        )}

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            className={`surface-card p-4 sm:p-6 ${user && !entitlement.isLoading && !hasAccess ? "opacity-60" : ""}`}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!hasAccess}
                    onClick={() => setMode(item.id)}
                    className={`pressable assistant-mode text-left disabled:cursor-not-allowed ${active ? "is-active" : ""}`}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="mt-2 text-sm font-semibold">{item.label}</div>
                    <div className="mt-0.5 text-[11px] leading-snug opacity-70">
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold">Ta demande</span>
              <Textarea
                value={query}
                disabled={!hasAccess}
                onChange={(event) => setQuery(event.target.value.slice(0, 3000))}
                placeholder="Exemple : compare les meilleurs quartiers de Tokyo pour un premier voyage."
                className="mt-2 min-h-36 resize-y rounded-xl bg-background/75 text-base leading-relaxed"
              />
              <span className="mt-1.5 block text-right text-[11px] text-muted-foreground">
                {query.length.toLocaleString("fr-FR")} / 3 000
              </span>
            </label>

            <Button
              onClick={() => research.mutate({ query: query.trim(), mode })}
              disabled={!hasAccess || query.trim().length < 4 || research.isPending}
              size="lg"
              className="mt-4 h-12 w-full rounded-xl shadow-soft sm:w-auto sm:min-w-60"
            >
              {research.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Préparation de la réponse…
                </>
              ) : (
                <>
                  <Compass className="mr-2 h-4 w-4" />
                  {turns.length ? "Continuer" : "Demander à AI Pro"}
                </>
              )}
            </Button>

            <div className="mt-6 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={!hasAccess}
                  onClick={() => setQuery(prompt)}
                  className="pressable min-w-[240px] rounded-xl border border-border/70 bg-background/75 px-3 py-2.5 text-left text-xs text-muted-foreground disabled:cursor-not-allowed sm:min-w-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <aside className="surface-subtle p-5 lg:sticky lg:top-20">
            <div className="eyebrow">
              <ShieldCheck className="h-3.5 w-3.5" />
              Bon usage
            </div>
            <h2 className="mt-2 font-display text-xl font-bold">À vérifier avant d'agir</h2>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Formalités :</strong> consulte les sites
                officiels.
              </p>
              <p>
                <strong className="text-foreground">Prix et horaires :</strong> vérifie auprès du
                prestataire.
              </p>
              <p>
                <strong className="text-foreground">Données privées :</strong> ne partage pas
                d'information bancaire.
              </p>
            </div>
          </aside>
        </section>

        {turns.length > 0 && (
          <section
            className="surface-card mt-5 overflow-hidden p-4 sm:p-7"
            aria-label="Conversation avec le conseiller"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <div className="eyebrow">
                  <Sparkles className="h-3.5 w-3.5" />
                  Conversation
                </div>
                <h2 className="mt-1 font-display text-2xl font-bold">Carnet de préparation</h2>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setTurns([]);
                  setQuery("");
                }}
                className="rounded-xl"
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Nouvelle
              </Button>
            </div>
            <div className="mt-5 space-y-5">
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div
                    key={turn.id}
                    className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground sm:max-w-[75%]"
                  >
                    {turn.content}
                  </div>
                ) : (
                  <article
                    key={turn.id}
                    className="assistant-answer rounded-2xl border border-border/65 bg-background/65 p-4 sm:p-5"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-primary">
                        <Compass className="h-4 w-4" />
                        GlobeLink AI Pro
                      </div>
                      {turn.updatedAt && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          {new Intl.DateTimeFormat("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(turn.updatedAt))}
                        </div>
                      )}
                    </div>
                    <div className="md-body">
                      <ReactMarkdown>{turn.content}</ReactMarkdown>
                    </div>
                  </article>
                ),
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
