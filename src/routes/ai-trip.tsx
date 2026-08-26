import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Crown,
  Lightbulb,
  Loader2,
  MapPin,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { askGlobeLinkFree } from "@/lib/ai-free.functions";

const search = z.object({ destination: z.string().optional() });

export const Route = createFileRoute("/ai-trip")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA — Assistant gratuit" },
      {
        name: "description",
        content:
          "Discute avec l’assistant voyage gratuit de GlobeLink pour trouver des idées de destinations et préparer les grandes lignes de ton voyage.",
      },
    ],
  }),
  validateSearch: (s) => search.parse(s),
  component: FreeAiPage,
});

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  {
    label: "Trouver une destination",
    text: "Aide-moi à trouver une destination selon mon budget, mes envies et ma période de voyage.",
    icon: MapPin,
  },
  {
    label: "Imaginer mon voyage",
    text: "Aide-moi à imaginer les grandes lignes d’un voyage qui me correspond.",
    icon: Lightbulb,
  },
  {
    label: "Que faire sur place ?",
    text: "Donne-moi des idées générales de choses à faire sur ma destination.",
    icon: Compass,
  },
] as const;

function FreeAiPage() {
  const { destination } = Route.useSearch();
  const { user } = useAuth();
  const askFreeFn = useServerFn(askGlobeLinkFree);
  const [query, setQuery] = useState(
    destination
      ? `Donne-moi des idées pour préparer un voyage à ${destination}.`
      : "",
  );
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

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
        ].slice(-12),
      );
      setRemaining(data.remaining);
      setQuery("");
    },
    onError: (error: Error) =>
      toast.error(error.message || "GlobeLink IA n'a pas pu répondre."),
  });

  const send = () => {
    const message = query.trim();
    if (!user) {
      toast.error("Connecte-toi pour utiliser GlobeLink IA.");
      return;
    }
    if (message.length < 3 || assistant.isPending) return;
    assistant.mutate(message);
  };

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-24 pt-4 sm:pt-7">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="rounded-xl">
              <Link to="/intelligence">
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux offres IA
              </Link>
            </Button>
            {remaining !== null && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                {remaining} demande{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""}
              </span>
            )}
          </div>

          <header className="relative overflow-hidden rounded-[2rem] border border-cyan-400/25 bg-card p-5 shadow-soft sm:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,211,238,.14),transparent_36%),radial-gradient(circle_at_92%_10%,rgba(139,92,246,.08),transparent_30%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-500">
                <Sparkles className="h-4 w-4" /> GlobeLink IA · Gratuit
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                De quoi as-tu besoin ?
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Demande des idées de destinations, des conseils rapides ou un exemple de journée. Cette version t’aide à préparer les grandes lignes sans recherche en temps réel.
              </p>

              <div className="mt-5 rounded-2xl border border-border/60 bg-background/55 p-3 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Mode gratuit :</strong> jusqu’à 40 demandes de chat par jour. Il ne consulte pas ton carnet et ne vérifie pas les prix, disponibilités ou établissements en temps réel.
              </div>
            </div>
          </header>

          <section className="mt-4 rounded-[2rem] border border-border/70 bg-card p-4 shadow-soft sm:p-6">
            {turns.length === 0 && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Quelques idées pour commencer
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {SUGGESTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => setQuery(item.text)}
                        className="group rounded-2xl border border-border/70 bg-background/65 p-4 text-left transition hover:border-cyan-400/35 hover:bg-cyan-500/[0.04]"
                      >
                        <Icon className="h-5 w-5 text-cyan-500" />
                        <div className="mt-3 text-sm font-semibold">{item.label}</div>
                        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Appuie pour préremplir ta demande
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {turns.length > 0 && (
              <div className="space-y-3">
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <div
                      key={turn.id}
                      className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground sm:max-w-[72%]"
                    >
                      {turn.content}
                    </div>
                  ) : (
                    <article
                      key={turn.id}
                      className="max-w-[96%] rounded-2xl rounded-bl-md border border-primary/15 bg-background/55 p-4 text-sm leading-relaxed sm:max-w-[84%]"
                    >
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-cyan-500">
                        <Sparkles className="h-3.5 w-3.5" /> GlobeLink IA · Gratuit
                      </div>
                      <div className="md-body">
                        <ReactMarkdown>{turn.content}</ReactMarkdown>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}

            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border/80 bg-background/75 p-2 focus-within:border-cyan-400/40 focus-within:ring-2 focus-within:ring-cyan-400/10">
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 1_200))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Demande une idée à GlobeLink IA…"
                className="h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon"
                onClick={send}
                disabled={query.trim().length < 3 || assistant.isPending}
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Envoyer à GlobeLink IA"
              >
                {assistant.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {!user && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Tu dois être connecté pour envoyer une demande. <Link to="/auth" className="font-semibold text-primary hover:underline">Se connecter</Link>
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              GlobeLink IA peut faire des erreurs. Vérifie les informations importantes avant de réserver.
            </p>
          </section>

          <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-violet-400">
                <Crown className="h-4 w-4" /> Besoin de vraies recherches ?
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                IA+ recherche des établissements, compare les options et utilise ton carnet pour organiser ton voyage.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl border-violet-400/30">
              <Link to="/ai-pro">
                Découvrir IA+ <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
}
