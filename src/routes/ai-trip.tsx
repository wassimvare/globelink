import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import {
  CalendarDays,
  Check,
  Crown,
  Download,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Users,
  Wallet,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { generateTripPlan } from "@/lib/ai-trip.functions";
import { useAuth } from "@/lib/auth-context";
import { destinationCover } from "@/lib/destination-cover";

const search = z.object({ destination: z.string().optional() });

export const Route = createFileRoute("/ai-trip")({
  head: () => ({
    meta: [
      { title: "GlobeLink IA — Créer un voyage" },
      {
        name: "description",
        content: "Crée gratuitement un itinéraire personnalisé avec GlobeLink IA.",
      },
    ],
  }),
  validateSearch: (s) => search.parse(s),
  component: AiTripPage,
});

const STYLES = [
  "Équilibré",
  "Aventure",
  "Culture",
  "Chill",
  "Foodie",
  "Nature",
  "Luxe",
  "Backpacker",
  "Romantique",
  "Famille",
];
const INTEREST_TAGS = [
  "Plages",
  "Randonnée",
  "Street food",
  "Musées",
  "Vie nocturne",
  "Surf",
  "Yoga",
  "Photo",
  "Design",
  "Vin & gastronomie",
  "Îles",
  "Temples",
];
const EXAMPLES = [
  { destination: "Japon", days: 12, budget: 1800 },
  { destination: "Bali", days: 10, budget: 1200 },
  { destination: "Portugal", days: 7, budget: 900 },
];

function AiTripPage() {
  const { destination: initial } = Route.useSearch();
  const { user } = useAuth();
  const generateTrip = useServerFn(generateTripPlan);
  const [destination, setDestination] = useState(initial ?? "");
  const [days, setDays] = useState(10);
  const [budget, setBudget] = useState(1800);
  const [travelers, setTravelers] = useState(1);
  const [style, setStyle] = useState("Équilibré");
  const [interests, setInterests] = useState<string[]>([]);

  const budgetPerPerson = useMemo(
    () => Math.round(budget / Math.max(1, travelers)),
    [budget, travelers],
  );
  const budgetPerDay = useMemo(
    () => Math.round(budget / Math.max(1, travelers * days)),
    [budget, travelers, days],
  );
  const isValid =
    destination.trim().length >= 2 &&
    days >= 1 &&
    days <= 60 &&
    budget >= 100 &&
    travelers >= 1 &&
    travelers <= 20;

  const toggleInterest = (tag: string) => {
    setInterests((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag].slice(0, 8),
    );
  };

  const plan = useMutation({
    mutationFn: async () => {
      if (!isValid)
        throw new Error("Vérifie la destination, la durée, le budget et le nombre de voyageurs.");
      if (!user) throw new Error("Connecte-toi pour utiliser GlobeLink IA.");
      const result = await generateTrip({
        data: {
          destination: destination.trim(),
          days,
          budget,
          travelers,
          style,
          interests: interests.join(", "),
        },
      });
      return { plan: result.plan, remaining: result.remaining };
    },
    onError: (error: any) =>
      toast.error(error?.message ?? "Impossible de créer le voyage pour le moment."),
  });

  const savePlan = async () => {
    if (!user) return toast.error("Connecte-toi pour enregistrer ce voyage.");
    if (!plan.data) return;
    const { error } = await supabase.from("trips").insert({
      user_id: user.id,
      title: `${destination.trim()} · ${days} jours`,
      country: destination.trim(),
      budget,
      notes: plan.data.plan,
      cover_url: destinationCover(destination),
      status: "planned",
    });
    if (error) toast.error("L'enregistrement a échoué. Réessaie.");
    else toast.success("Voyage ajouté à ton carnet ✨");
  };

  const reset = () => {
    setDestination("");
    setDays(10);
    setBudget(1800);
    setTravelers(1);
    setStyle("Équilibré");
    setInterests([]);
    plan.reset();
  };

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="page-container pb-24 pt-4 sm:pt-7">
        <header className="relative overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-card p-5 shadow-soft sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,.12),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(139,92,246,.10),transparent_32%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-500">
                <Sparkles className="h-4 w-4" /> GlobeLink IA <span className="rounded-full bg-cyan-500/15 px-2 py-0.5">Gratuit</span>
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
                Crée un voyage qui te ressemble.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Donne l’essentiel à GlobeLink IA : destination, durée, budget et envies. Il te prépare un mini-itinéraire clair et personnalisé.
              </p>
            </div>
            <Button asChild variant="outline" className="rounded-2xl border-violet-400/30 bg-violet-500/[0.06]">
              <Link to="/ai-pro"><Crown className="mr-2 h-4 w-4 text-violet-400" /> Découvrir IA+</Link>
            </Button>
          </div>
        </header>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-[2rem] border border-border/70 bg-card p-4 shadow-soft sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination" hint="Pays, ville ou région">
                <Input value={destination} onChange={(e) => setDestination(e.target.value.slice(0, 100))} placeholder="Japon, Bali, Portugal…" />
              </Field>
              <Field label="Durée" hint="1 à 60 jours" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(clamp(Number(e.target.value), 1, 60))} />
              </Field>
              <Field label="Budget total" hint="Budget estimatif du séjour" icon={<Wallet className="h-3.5 w-3.5" />}>
                <div className="relative">
                  <Input className="pr-10" type="number" min={100} max={100000} step={50} value={budget} onChange={(e) => setBudget(clamp(Number(e.target.value), 100, 100000))} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">€</span>
                </div>
              </Field>
              <Field label="Voyageurs" hint="1 à 20 personnes" icon={<Users className="h-3.5 w-3.5" />}>
                <Input type="number" min={1} max={20} value={travelers} onChange={(e) => setTravelers(clamp(Number(e.target.value), 1, 20))} />
              </Field>
            </div>

            <div className="my-6 h-px bg-border/60" />

            <ChoiceGroup title="Style de voyage" subtitle="Choisis l’ambiance dominante du séjour.">
              {STYLES.map((item) => {
                const active = style === item;
                return (
                  <button key={item} type="button" onClick={() => setStyle(item)} aria-pressed={active} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border/80 bg-secondary/55 text-foreground/75 hover:border-primary/35"}`}>
                    {active && <Check className="h-3.5 w-3.5" />}{item}
                  </button>
                );
              })}
            </ChoiceGroup>

            <div className="mt-6">
              <ChoiceGroup title="Centres d’intérêt" subtitle="Jusqu’à 8 choix pour affiner le voyage." action={interests.length > 0 ? <button type="button" onClick={() => setInterests([])} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Effacer</button> : null}>
                {INTEREST_TAGS.map((tag) => {
                  const active = interests.includes(tag);
                  return (
                    <button key={tag} type="button" onClick={() => toggleInterest(tag)} aria-pressed={active} className={`min-h-10 rounded-full border px-3.5 py-2 text-sm transition ${active ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300" : "border-border/80 bg-secondary/55 text-foreground/75 hover:border-cyan-400/35"}`}>
                      {tag}
                    </button>
                  );
                })}
              </ChoiceGroup>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => plan.mutate()} disabled={!isValid || plan.isPending} size="lg" className="h-12 flex-1 rounded-2xl shadow-soft">
                {plan.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> GlobeLink IA prépare ton voyage…</> : <><Wand2 className="mr-2 h-4 w-4" /> Créer mon voyage</>}
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={reset} className="h-12 rounded-2xl">
                <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Essayer :</span>
              {EXAMPLES.map((item) => (
                <button key={item.destination} type="button" onClick={() => { setDestination(item.destination); setDays(item.days); setBudget(item.budget); }} className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 font-medium text-muted-foreground transition hover:border-primary/30 hover:text-foreground">
                  {item.days}j {item.destination} · {item.budget.toLocaleString("fr-FR")} €
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <section className="rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Info className="h-3.5 w-3.5" /> Résumé</div>
              <h2 className="mt-2 font-display text-2xl font-bold">Ton cadre de voyage</h2>
              <div className="mt-5 space-y-3">
                <SummaryLine label="Destination" value={destination.trim() || "À définir"} />
                <SummaryLine label="Durée" value={`${days} jour${days > 1 ? "s" : ""}`} />
                <SummaryLine label="Groupe" value={`${travelers} voyageur${travelers > 1 ? "s" : ""}`} />
                <SummaryLine label="Style" value={style} />
              </div>
              <div className="my-5 h-px bg-border/60" />
              <div className="rounded-2xl bg-primary/[0.06] p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget indicatif</div>
                <div className="mt-2 font-display text-3xl font-semibold">{budgetPerPerson.toLocaleString("fr-FR")} €</div>
                <div className="text-sm text-muted-foreground">par personne · env. {budgetPerDay.toLocaleString("fr-FR")} € / jour</div>
              </div>
              {plan.data && <p className="mt-3 text-center text-xs text-muted-foreground">{plan.data.remaining} génération{plan.data.remaining > 1 ? "s" : ""} gratuite{plan.data.remaining > 1 ? "s" : ""} restante{plan.data.remaining > 1 ? "s" : ""} aujourd’hui</p>}
            </section>

            <section className="rounded-[2rem] border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.10] to-card p-5 shadow-soft">
              <div className="flex items-center gap-2 font-bold text-violet-400"><Crown className="h-4 w-4" /> Besoin de plus ?</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">IA+ compare, optimise le budget et t’accompagne dans les modifications de ton voyage.</p>
              <Button asChild className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white"><Link to="/ai-pro">Découvrir IA+</Link></Button>
            </section>
          </aside>
        </div>

        {plan.data && (
          <article className="mt-8 animate-rise overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-8">
            <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Sparkles className="h-3.5 w-3.5" /> GlobeLink IA</div>
                <h2 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{destination} en {days} jours</h2>
                <p className="mt-1 text-sm text-muted-foreground">{travelers} voyageur(s) · {budget.toLocaleString("fr-FR")} € · style {style}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => { navigator.clipboard.writeText(plan.data!.plan); toast.success("Itinéraire copié"); }}><Download className="mr-2 h-4 w-4" /> Copier</Button>
                <Button size="sm" className="rounded-full" onClick={savePlan}><Save className="mr-2 h-4 w-4" /> Enregistrer</Button>
              </div>
            </div>
            <div className="md-body mt-6"><ReactMarkdown>{plan.data.plan}</ReactMarkdown></div>
          </article>
        )}

        {!plan.data && !plan.isPending && (
          <div className="mt-8 rounded-[2rem] border border-border/60 bg-secondary/35 p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-3 h-7 w-7 text-primary" /> Ton itinéraire apparaîtra ici avec le programme jour par jour, le budget, les hébergements et la check-list.
          </div>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-4 text-center text-xs text-muted-foreground">
          <Link to="/intelligence" className="font-semibold underline underline-offset-4">Retour à GlobeLink IA</Link>
          <Link to="/trips" className="font-semibold underline underline-offset-4">Retrouver mes voyages sauvegardés</Link>
        </div>
      </main>
    </div>
  );
}

function Field({ label, hint, icon, children }: { label: string; hint: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">{icon}{label}</span>{children}<span className="mt-1.5 block text-[11px] text-muted-foreground">{hint}</span></label>;
}

function ChoiceGroup({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div><div className="flex items-end justify-between gap-3"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div>{action}</div><div className="mt-3 flex flex-wrap gap-2">{children}</div></div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 text-sm"><span className="text-muted-foreground">{label}</span><span className="max-w-[60%] text-right font-semibold">{value}</span></div>;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
