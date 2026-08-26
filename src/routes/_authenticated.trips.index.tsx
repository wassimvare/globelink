import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  Calendar,
  Compass,
  Heart,
  Map as MapIcon,
  MapPin,
  Notebook,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { destinationCover } from "@/lib/destination-cover";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => ({
    meta: [
      { title: "Voyage — GlobeLink" },
      {
        name: "description",
        content:
          "Ton espace voyage GlobeLink : prochain voyage, carnet, Explorer, assistant IA et Travel Match au même endroit.",
      },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    country: "",
    city: "",
    budget: "",
    startsOn: "",
    endsOn: "",
    notes: "",
  });

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const focusTrip = useMemo(() => {
    if (!trips?.length) return null;

    const active = trips.find(
      (trip) =>
        !trip.finalized_at &&
        !!trip.starts_on &&
        trip.starts_on <= today &&
        (!trip.ends_on || trip.ends_on >= today),
    );
    if (active) return active;

    const upcoming = trips
      .filter(
        (trip) =>
          !trip.finalized_at &&
          (!trip.starts_on || trip.starts_on >= today),
      )
      .sort((a, b) => {
        if (!a.starts_on && !b.starts_on) return 0;
        if (!a.starts_on) return 1;
        if (!b.starts_on) return -1;
        return a.starts_on.localeCompare(b.starts_on);
      });

    return upcoming[0] ?? trips[0];
  }, [trips, today]);

  const focusIsActive = Boolean(
    focusTrip?.starts_on &&
      focusTrip.starts_on <= today &&
      (!focusTrip.ends_on || focusTrip.ends_on >= today),
  );

  const create = useMutation({
    mutationFn: async () => {
      if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
        throw new Error("La date de retour doit être après la date de départ.");
      }

      const { data, error } = await supabase
        .from("trips")
        .insert({
          user_id: user!.id,
          title: form.title || `${form.country} voyage`,
          country: form.country.trim(),
          city: form.city.trim() || null,
          budget: form.budget ? Number(form.budget) : null,
          starts_on: form.startsOn || null,
          ends_on: form.endsOn || null,
          notes: form.notes.trim() || null,
          cover_url: destinationCover(form.country, form.city),
          status: "planned",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Voyage créé");
      setOpen(false);
      setForm({
        title: "",
        country: "",
        city: "",
        budget: "",
        startsOn: "",
        endsOn: "",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["trips"] });
      navigate({ to: "/trips/$id", params: { id: data.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <div className="app-page min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:pt-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-5 shadow-soft sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,.14),transparent_34%),radial-gradient(circle_at_90%_5%,rgba(139,92,246,.13),transparent_31%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                <Notebook className="h-4 w-4" /> Ton espace Voyage
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
                Tout ton voyage, au même endroit.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Découvre des lieux, organise ton carnet avec GlobeLink IA, rencontre des voyageurs compatibles et retrouve tout pendant ton séjour.
              </p>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="h-12 rounded-2xl px-5 shadow-soft">
                  <Plus className="mr-2 h-4 w-4" /> Nouveau voyage
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Créer un voyage</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Titre (ex : Été indonésien)"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Pays *"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                    />
                    <Input
                      placeholder="Ville / région"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                      Départ
                      <Input
                        type="date"
                        value={form.startsOn}
                        onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                      Retour
                      <Input
                        type="date"
                        min={form.startsOn || undefined}
                        value={form.endsOn}
                        onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                      />
                    </label>
                  </div>
                  <Input
                    placeholder="Budget prévu (€)"
                    type="number"
                    min="0"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                  />
                  <Textarea
                    placeholder="Notes, plans, envies…"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={4}
                  />
                </div>
                <DialogFooter>
                  <Button
                    disabled={!form.country.trim() || create.isPending}
                    onClick={() => create.mutate()}
                    className="rounded-full"
                  >
                    {create.isPending ? "Création…" : "Créer mon voyage"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </section>

        {isLoading ? (
          <div className="mt-5 skeleton h-[310px] rounded-[2rem]" />
        ) : focusTrip ? (
          <section className="mt-5 overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-soft">
            <div className="grid lg:grid-cols-[1.1fr_.9fr]">
              <div className="relative min-h-[270px] overflow-hidden bg-muted sm:min-h-[330px]">
                <img
                  src={focusTrip.cover_url || destinationCover(focusTrip.country, focusTrip.city)}
                  alt={`Voyage ${focusTrip.title}`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/5" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
                  <div className="mb-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                    {focusIsActive ? "✈️ Voyage en cours" : "🗓️ Prochain voyage"}
                  </div>
                  <h2 className="font-display text-3xl font-bold sm:text-4xl">{focusTrip.title}</h2>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
                    <MapPin className="h-4 w-4" />
                    {[focusTrip.city, focusTrip.country].filter(Boolean).join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/80">
                    {focusTrip.starts_on && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(focusTrip.starts_on)}
                        {focusTrip.ends_on ? ` → ${formatDate(focusTrip.ends_on)}` : ""}
                      </span>
                    )}
                    {focusTrip.budget && (
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5" /> {Number(focusTrip.budget).toLocaleString("fr-FR")} €
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center p-5 sm:p-7">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Continuer la préparation
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold">
                  Reprends exactement où tu en étais.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Ton carnet est le point de référence du voyage. GlobeLink IA, Explorer et Travel Match viennent ensuite enrichir ce même projet.
                </p>

                <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Button asChild className="h-11 rounded-xl">
                    <Link to="/trips/$id" params={{ id: focusTrip.id }}>
                      Ouvrir mon voyage <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 rounded-xl">
                    <Link to="/intelligence">
                      <Sparkles className="mr-2 h-4 w-4" /> Demander à l’IA
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-5 rounded-[2rem] border border-dashed border-primary/25 bg-primary/[0.03] p-7 text-center sm:p-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Notebook className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold">Commence ton premier voyage</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Crée ton espace de voyage puis utilise Explorer, GlobeLink IA et Travel Match autour de ce même projet.
            </p>
            <Button onClick={() => setOpen(true)} className="mt-5 rounded-2xl">
              <Plus className="mr-2 h-4 w-4" /> Créer mon voyage
            </Button>
          </section>
        )}

        <section className="mt-8">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Ton parcours</p>
            <h2 className="mt-1 font-display text-2xl font-bold">Préparer, rencontrer, vivre</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <JourneyCard
              number="1"
              icon={Compass}
              title="Découvrir"
              description="Hôtels, restaurants, activités, offres et lieux sur la carte."
              to="/map"
            />
            <JourneyCard
              number="2"
              icon={Sparkles}
              title="Organiser"
              description="Utilise GlobeLink IA pour transformer tes idées en plan concret."
              to="/intelligence"
            />
            <JourneyCard
              number="3"
              icon={Heart}
              title="Rencontrer"
              description="Trouve des voyageurs compatibles avec ta destination et tes dates."
              to="/match"
            />
            <JourneyCard
              number="4"
              icon={Notebook}
              title="Vivre"
              description="Garde tes étapes, dépenses, photos et souvenirs dans ton carnet."
              to={focusTrip ? `/trips/${focusTrip.id}` : "/trips"}
            />
          </div>
        </section>

        <section className="mt-9">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Carnet connecté</p>
              <h2 className="mt-1 font-display text-2xl font-bold">Tous mes voyages</h2>
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Ajouter
            </Button>
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-56 rounded-3xl" />
                ))}
              </div>
            ) : trips && trips.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {trips.map((trip) => (
                  <Link
                    key={trip.id}
                    to="/trips/$id"
                    params={{ id: trip.id }}
                    className="group animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft transition hover:-translate-y-1 hover:shadow-elevated"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      <img
                        src={trip.cover_url || destinationCover(trip.country, trip.city)}
                        alt={`Couverture ${[trip.city, trip.country].filter(Boolean).join(", ") || trip.title}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                      <span className="absolute right-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                        {trip.finalized_at ? "Terminé" : statusLabel(trip.status)}
                      </span>
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-display text-lg">{trip.title}</h3>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {[trip.city, trip.country].filter(Boolean).join(", ")}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {trip.budget && (
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3 w-3" /> {Number(trip.budget).toLocaleString("fr-FR")} €
                          </span>
                        )}
                        {trip.starts_on && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {formatDate(trip.starts_on)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border p-9 text-center text-sm text-muted-foreground">
                Aucun voyage enregistré pour le moment.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function JourneyCard({
  number,
  icon: Icon,
  title,
  description,
  to,
}: {
  number: string;
  icon: typeof MapIcon;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to as any}
      preload="intent"
      className="group rounded-3xl border border-border/70 bg-card p-4 shadow-soft transition hover:-translate-y-1 hover:border-primary/25 hover:shadow-elevated"
    >
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-xs font-bold text-muted-foreground">0{number}</span>
      </div>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-1 min-h-[44px] text-xs leading-relaxed text-muted-foreground">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">
        Ouvrir <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: string | null) {
  if (status === "active") return "En cours";
  if (status === "completed") return "Terminé";
  return "Prévu";
}
