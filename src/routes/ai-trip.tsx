import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import {
  CalendarDays,
  Check,
  Download,
  Info,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
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
import { useAuth } from "@/lib/auth-context";
import { destinationCover } from "@/lib/destination-cover";

const search = z.object({ destination: z.string().optional() });

export const Route = createFileRoute("/ai-trip")({
  head: () => ({
    meta: [
      { title: "Assistant voyage — GlobeLink" },
      { name: "description", content: "Crée un itinéraire de voyage personnalisé en quelques secondes avec l'assistant GlobeLink." },
    ],
  }),
  validateSearch: (s) => search.parse(s),
  component: AiTripPage,
});

const STYLES = ["Équilibré", "Aventure", "Culture", "Chill", "Foodie", "Nature", "Luxe", "Backpacker", "Romantique", "Famille"];
const INTEREST_TAGS = ["Plages", "Randonnée", "Street food", "Musées", "Vie nocturne", "Surf", "Yoga", "Photo", "Design", "Vin & gastronomie", "Îles", "Temples"];
const EXAMPLES = [
  { destination: "Japon", days: 12, budget: 1800 },
  { destination: "Bali", days: 10, budget: 1200 },
  { destination: "Portugal", days: 7, budget: 900 },
];

function AiTripPage() {
  const { destination: initial } = Route.useSearch();
  const { user } = useAuth();
  const [destination, setDestination] = useState(initial ?? "");
  const [days, setDays] = useState(10);
  const [budget, setBudget] = useState(1800);
  const [travelers, setTravelers] = useState(1);
  const [style, setStyle] = useState("Équilibré");
  const [interests, setInterests] = useState<string[]>([]);

  const budgetPerPerson = useMemo(() => Math.round(budget / Math.max(1, travelers)), [budget, travelers]);
  const budgetPerDay = useMemo(() => Math.round(budget / Math.max(1, travelers * days)), [budget, travelers, days]);
  const isValid = destination.trim().length >= 2 && days >= 1 && days <= 60 && budget >= 100 && travelers >= 1 && travelers <= 20;

  const toggleInterest = (tag: string) => {
    setInterests((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag].slice(0, 8));
  };

  const plan = useMutation({
    mutationFn: async () => {
      if (!isValid) throw new Error("Vérifie la destination, la durée, le budget et le nombre de voyageurs.");
      const text = await askPuter(buildTravelPlanMessages({
        destination: destination.trim(), days, budget, travelers, style, interests,
      }));
      return { plan: text, provider: "Puter" };
    },
    onError: (error: any) => toast.error(error?.message ?? "Impossible de créer le voyage pour le moment."),
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
    <div className="app-page">
      <AppHeader />

      <main className="page-container pb-16">
        <header className="page-heading">
          <div className="max-w-2xl">
            <div className="eyebrow"><Sparkles className="h-4 w-4" /> Conseiller voyage</div>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl">Prépare un voyage qui te ressemble.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Indique l’essentiel et GlobeLink te propose un programme clair, réaliste et adapté au budget du groupe.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-3 text-xs text-muted-foreground shadow-soft backdrop-blur lg:flex">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div><strong className="block text-foreground">Sans clé API à configurer</strong>Une connexion Puter peut être demandée au premier usage.</div>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="surface-card rounded-[2rem] p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Destination" hint="Pays, ville ou région">
                <Input value={destination} onChange={(e) => setDestination(e.target.value.slice(0, 100))} placeholder="Japon, Bali, Portugal…" />
              </Field>
              <Field label="Durée" hint="1 à 60 jours" icon={<CalendarDays className="h-3.5 w-3.5" />}>
                <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(clamp(Number(e.target.value), 1, 60))} />
              </Field>
              <Field label="Budget total" hint="Transport compris ou non, selon ton choix" icon={<Wallet className="h-3.5 w-3.5" />}>
                <div className="relative"><Input className="pr-10" type="number" min={100} max={100000} step={50} value={budget} onChange={(e) => setBudget(clamp(Number(e.target.value), 100, 100000))} /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">€</span></div>
              </Field>
              <Field label="Voyageurs" hint="1 à 20 personnes" icon={<Users className="h-3.5 w-3.5" />}>
                <Input type="number" min={1} max={20} value={travelers} onChange={(e) => setTravelers(clamp(Number(e.target.value), 1, 20))} />
              </Field>
            </div>

            <div className="my-6 soft-divider" />

            <ChoiceGroup title="Style de voyage" subtitle="Choisis l'ambiance dominante du séjour.">
              {STYLES.map((item) => {
                const active = style === item;
                return (
                  <button key={item} type="button" onClick={() => setStyle(item)} aria-pressed={active} className={`pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold ${active ? "border-primary bg-primary text-primary-foreground shadow-soft" : "border-border/80 bg-secondary/65 text-foreground/75 hover:border-primary/35 hover:bg-card"}`}>
                    {active && <Check className="h-3.5 w-3.5" />}{item}
                  </button>
                );
              })}
            </ChoiceGroup>

            <div className="mt-6">
              <ChoiceGroup title="Centres d'intérêt" subtitle="Jusqu'à 8 choix pour affiner le programme." action={interests.length > 0 ? <button type="button" onClick={() => setInterests([])} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Effacer</button> : null}>
                {INTEREST_TAGS.map((tag) => {
                  const active = interests.includes(tag);
                  return (
                    <button key={tag} type="button" onClick={() => toggleInterest(tag)} aria-pressed={active} className={`pressable min-h-10 rounded-full border px-3.5 py-2 text-sm ${active ? "border-accent bg-accent text-accent-foreground shadow-soft" : "border-border/80 bg-secondary/65 text-foreground/75 hover:border-accent/40 hover:bg-card"}`}>
                      {tag}
                    </button>
                  );
                })}
              </ChoiceGroup>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => plan.mutate()} disabled={!isValid || plan.isPending} size="lg" className="h-12 flex-1 rounded-2xl bg-primary text-primary-foreground shadow-soft transition hover:-translate-y-0.5 hover:shadow-glow active:translate-y-0">
                {plan.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Préparation de l’itinéraire…</> : <><Wand2 className="mr-2 h-4 w-4" /> Préparer mon voyage</>}
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={reset} className="h-12 rounded-2xl"><RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser</Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Essayer :</span>
              {EXAMPLES.map((item) => (
                <button key={item.destination} type="button" onClick={() => { setDestination(item.destination); setDays(item.days); setBudget(item.budget); }} className="pressable rounded-full border border-border/70 bg-background/70 px-3 py-1.5 font-medium text-muted-foreground hover:border-primary/30 hover:text-foreground">
                  {item.days}j {item.destination} · {item.budget.toLocaleString("fr-FR")} €
                </button>
              ))}
            </div>
          </section>

          <aside className="surface-card rounded-[2rem] p-5 lg:sticky lg:top-20">
            <div className="eyebrow"><Info className="h-3.5 w-3.5" /> Résumé</div>
            <h2 className="mt-2 font-display text-2xl">Ton cadre de voyage</h2>
            <div className="mt-5 space-y-3">
              <SummaryLine label="Destination" value={destination.trim() || "À définir"} />
              <SummaryLine label="Durée" value={`${days} jour${days > 1 ? "s" : ""}`} />
              <SummaryLine label="Groupe" value={`${travelers} voyageur${travelers > 1 ? "s" : ""}`} />
              <SummaryLine label="Style" value={style} />
            </div>
            <div className="my-5 soft-divider" />
            <div className="rounded-2xl bg-primary/[0.06] p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget indicatif</div>
              <div className="mt-2 font-display text-3xl font-semibold">{budgetPerPerson.toLocaleString("fr-FR")} €</div>
              <div className="text-sm text-muted-foreground">par personne · environ {budgetPerDay.toLocaleString("fr-FR")} € / jour</div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">L’itinéraire est une aide à la préparation. Vérifie les horaires, tarifs, formalités et disponibilités avant de réserver.</p>
            <Button asChild variant="outline" className="mt-4 w-full rounded-xl"><Link to="/ai-pro"><Sparkles className="mr-2 h-4 w-4" /> Poser une question au conseiller</Link></Button>
          </aside>
        </div>

        {plan.data && (
          <article className="surface-card mt-8 animate-rise overflow-hidden rounded-[2rem] p-5 sm:p-8">
            <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="eyebrow">Itinéraire généré</div>
                <h2 className="mt-1 font-display text-3xl sm:text-4xl">{destination} en {days} jours</h2>
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
          <div className="surface-subtle mt-8 rounded-[2rem] p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-3 h-7 w-7 text-accent" />
            Ton itinéraire apparaîtra ici avec le programme jour par jour, le budget, les hébergements et la check-list.
          </div>
        )}

        <div className="mt-7 text-center text-xs text-muted-foreground"><Link to="/trips" className="font-semibold underline underline-offset-4">Retrouver mes voyages sauvegardés</Link></div>
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
