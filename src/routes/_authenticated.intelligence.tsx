import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  CalendarDays,
  CloudSun,
  Compass,
  Heart,
  Loader2,
  MapPin,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Users,
  Wallet,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { getPhase3Context, organizeSmartDay } from "@/lib/phase3-intelligence.functions";

export const Route = createFileRoute("/_authenticated/intelligence")({
  head: () => ({
    meta: [
      { title: "GlobeLink Intelligence — Organise ma journée" },
      {
        name: "description",
        content:
          "GlobeLink AI 2.0 combine voyage, budget, météo, événements et Travel Match pour organiser une journée personnalisée.",
      },
    ],
  }),
  component: IntelligencePage,
});

type PlannerMode = "day" | "nearby" | "food" | "activity" | "trip";
type Pace = "relaxed" | "balanced" | "intense";

const MODES: Array<{
  id: PlannerMode;
  label: string;
  description: string;
  icon: typeof Wand2;
}> = [
  { id: "day", label: "Organise ma journée", description: "Du matin au soir", icon: Wand2 },
  { id: "nearby", label: "Autour de moi", description: "Limiter les trajets", icon: MapPin },
  { id: "food", label: "Où manger ?", description: "Expériences culinaires", icon: UtensilsCrossed },
  { id: "activity", label: "Trouve une activité", description: "Selon météo et événements", icon: Activity },
  { id: "trip", label: "Mode voyage", description: "Utiliser mon carnet", icon: Compass },
];

function IntelligencePage() {
  const { user } = useAuth();
  const contextFn = useServerFn(getPhase3Context);
  const organizeFn = useServerFn(organizeSmartDay);
  const [mode, setMode] = useState<PlannerMode>("day");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [budget, setBudget] = useState(80);
  const [availableHours, setAvailableHours] = useState(8);
  const [pace, setPace] = useState<Pace>("balanced");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const contextQuery = useQuery({
    queryKey: ["phase3-intelligence-context", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () => contextFn(),
  });

  useEffect(() => {
    if (!contextQuery.data || hydrated) return;
    const data = contextQuery.data;
    setCity(data.location.city || data.intent?.destination_city || data.trip?.city || "");
    setCountry(
      data.location.country || data.intent?.destination_country || data.trip?.country || "",
    );
    const tripBudget = Number(data.trip?.budget ?? data.intent?.budget_eur ?? 0);
    if (Number.isFinite(tripBudget) && tripBudget > 0) {
      const start = data.trip?.starts_on ? Date.parse(data.trip.starts_on) : Number.NaN;
      const end = data.trip?.ends_on ? Date.parse(data.trip.ends_on) : Number.NaN;
      const days = Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(1, Math.floor((end - start) / 86_400_000) + 1)
        : 7;
      setBudget(Math.max(20, Math.min(500, Math.round(tripBudget / days))));
    }
    setHydrated(true);
  }, [contextQuery.data, hydrated]);

  const planner = useMutation({
    mutationFn: () =>
      organizeFn({
        data: {
          mode,
          city: city.trim() || undefined,
          country: country.trim() || undefined,
          budget,
          availableHours,
          pace,
          notes: notes.trim() || undefined,
        },
      }),
    onError: (error: Error) =>
      toast.error(error.message || "GlobeLink AI n'a pas pu organiser la journée."),
  });

  const weather = contextQuery.data?.weather;
  const trip = contextQuery.data?.trip;
  const matches = contextQuery.data?.matches ?? [];
  const events = contextQuery.data?.events ?? [];

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-20 pt-4 sm:pt-7">
        <header className="travel-assistant-hero surface-card overflow-hidden p-5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end">
            <div className="max-w-3xl">
              <div className="eyebrow">
                <Sparkles className="h-4 w-4" /> Phase 3 · GlobeLink AI 2.0
              </div>
              <h1 className="mt-3 font-display text-3xl font-bold leading-tight sm:text-5xl">
                Organise ta journée avec ton vrai contexte de voyage.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                GlobeLink combine ton voyage, ton budget, tes préférences, la météo Open‑Meteo,
                les événements Ticketmaster et les voyageurs compatibles. Il ne fabrique pas de
                restaurant ou d'événement quand aucune source vérifiée n'est disponible.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/75 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Compass className="h-4 w-4 text-primary" /> Contexte GlobeLink
              </div>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <StatusLine label="Météo" active={!!weather} value={weather ? "Open‑Meteo" : "Non disponible"} />
                <StatusLine label="Événements" active={events.length > 0} value={events.length ? "Ticketmaster" : "Aucun proche"} />
                <StatusLine label="Travel Match" active={matches.length > 0} value={`${matches.length} suggestion${matches.length > 1 ? "s" : ""}`} />
              </div>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="surface-card p-4 sm:p-6">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    className={`pressable rounded-2xl border p-3 text-left transition ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border/70 bg-background/70 hover:border-primary/30"}`}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="mt-2 text-sm font-semibold">{item.label}</div>
                    <div className={`mt-0.5 text-[11px] ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold">Ville / région</span>
                <Input
                  className="mt-2"
                  value={city}
                  onChange={(event) => setCity(event.target.value.slice(0, 100))}
                  placeholder="Paris, Bali, Tokyo…"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Pays</span>
                <Input
                  className="mt-2"
                  value={country}
                  onChange={(event) => setCountry(event.target.value.slice(0, 80))}
                  placeholder="France, Indonésie…"
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Wallet className="h-4 w-4" /> Budget aujourd'hui
                </span>
                <div className="relative mt-2">
                  <Input
                    type="number"
                    min={0}
                    max={5000}
                    value={budget}
                    onChange={(event) => setBudget(Math.max(0, Math.min(5000, Number(event.target.value) || 0)))}
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                </div>
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <CalendarDays className="h-4 w-4" /> Temps disponible
                </span>
                <div className="relative mt-2">
                  <Input
                    type="number"
                    min={1}
                    max={16}
                    value={availableHours}
                    onChange={(event) => setAvailableHours(Math.max(1, Math.min(16, Number(event.target.value) || 1)))}
                    className="pr-10"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">h</span>
                </div>
              </label>
            </div>

            <div className="mt-5">
              <div className="text-sm font-semibold">Rythme</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ["relaxed", "Tranquille"],
                  ["balanced", "Équilibré"],
                  ["intense", "Intense"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPace(value)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${pace === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/60"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold">Envies particulières</span>
              <Textarea
                className="mt-2 min-h-24 resize-y"
                value={notes}
                onChange={(event) => setNotes(event.target.value.slice(0, 500))}
                placeholder="Ex : je veux éviter les musées, marcher peu, voir un événement le soir…"
              />
            </label>

            <Button
              size="lg"
              disabled={planner.isPending || (!city.trim() && !country.trim())}
              onClick={() => planner.mutate()}
              className="mt-6 h-12 w-full rounded-2xl shadow-soft sm:w-auto sm:min-w-64"
            >
              {planner.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> GlobeLink organise ta journée…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> {MODES.find((item) => item.id === mode)?.label}
                </>
              )}
            </Button>
          </div>

          <aside className="space-y-4">
            <ContextCard
              icon={<CloudSun className="h-4 w-4" />}
              title="Météo maintenant"
              loading={contextQuery.isLoading}
            >
              {weather ? (
                <>
                  <div className="font-display text-2xl font-bold">{weather.temperatureC ?? "?"} °C</div>
                  <div className="text-sm font-semibold">{weather.label}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Min {weather.lowC ?? "?"}° · Max {weather.highC ?? "?"}° · pluie {weather.precipitationProbability ?? "?"}%
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Ajoute une destination reconnue pour charger la météo.</p>
              )}
            </ContextCard>

            <ContextCard icon={<Compass className="h-4 w-4" />} title="Mode voyage" loading={contextQuery.isLoading}>
              {trip ? (
                <>
                  <div className="font-semibold">{trip.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[trip.city, trip.country].filter(Boolean).join(", ")}
                    {trip.budget ? ` · ${trip.budget} €` : ""}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3 rounded-xl">
                    <Link to="/trips/$id" params={{ id: trip.id }}>Ouvrir le voyage</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Aucun voyage actif dans ton carnet.</p>
                  <Button asChild size="sm" variant="outline" className="mt-3 rounded-xl">
                    <Link to="/trips">Créer un voyage</Link>
                  </Button>
                </>
              )}
            </ContextCard>
          </aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="surface-card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow"><Heart className="h-3.5 w-3.5" /> Travel Match intelligent</div>
                <h2 className="mt-1 font-display text-2xl font-bold">Compatibilités expliquées</h2>
              </div>
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link to="/match">Voir tous</Link>
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {matches.length ? matches.map((match) => (
                <div key={match.profileId} className="rounded-2xl border border-border/70 bg-background/65 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{match.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{match.destination}</div>
                    </div>
                    <Badge className="shrink-0 rounded-full bg-primary text-primary-foreground">{match.score}% compatible</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{match.explanation}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Ajoute un projet de voyage public pour obtenir des compatibilités basées sur la destination, les dates, les langues, les intérêts et le budget.
                </div>
              )}
            </div>
          </div>

          <div className="surface-card p-5 sm:p-6">
            <div className="eyebrow"><Ticket className="h-3.5 w-3.5" /> Ticketmaster</div>
            <h2 className="mt-1 font-display text-2xl font-bold">Événements vérifiés à proximité</h2>
            <div className="mt-4 space-y-3">
              {events.length ? events.slice(0, 4).map((event) => (
                <div key={event.id} className="rounded-2xl border border-border/70 bg-background/65 p-4">
                  <div className="font-semibold">{event.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[event.date, event.time, event.venue, event.city].filter(Boolean).join(" · ")}
                  </div>
                  {event.url && (
                    <a href={event.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-primary hover:underline">
                      Voir la source Ticketmaster →
                    </a>
                  )}
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Aucun événement Ticketmaster proche n'est disponible pour cette destination actuellement.
                </div>
              )}
            </div>
          </div>
        </section>

        {planner.data && (
          <section className="surface-card mt-5 overflow-hidden p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <div className="eyebrow"><Sparkles className="h-3.5 w-3.5" /> Programme personnalisé</div>
                <h2 className="mt-1 font-display text-3xl font-bold">{planner.data.context.destination}</h2>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                <div>{planner.data.providerName} · {planner.data.modelId}</div>
                <div>{planner.data.remaining} utilisation(s) IA restante(s)</div>
              </div>
            </div>
            <article className="md-body mt-5">
              <ReactMarkdown>{planner.data.answer}</ReactMarkdown>
            </article>
          </section>
        )}

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <QuickLink to="/ai-trip" icon={<Sparkles className="h-4 w-4" />} title="Préparer un voyage" text="Créer un itinéraire complet" />
          <QuickLink to="/trips" icon={<Compass className="h-4 w-4" />} title="Mon voyage" text="Carnet, budget et journées" />
          <QuickLink to="/match" icon={<Users className="h-4 w-4" />} title="Voyageurs compatibles" text="Continuer sur Travel Match" />
        </section>
      </main>
    </div>
  );
}

function StatusLine({ label, active, value }: { label: string; active: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={active ? "font-semibold text-emerald-600" : "text-muted-foreground"}>{value}</span>
    </div>
  );
}

function ContextCard({
  icon,
  title,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {icon} {title}
      </div>
      <div className="mt-3">
        {loading ? <div className="skeleton h-16 rounded-xl" /> : children}
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  title,
  text,
}: {
  to: "/ai-trip" | "/trips" | "/match";
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className="surface-card pressable flex items-center gap-3 p-4 hover:border-primary/30">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
    </Link>
  );
}
