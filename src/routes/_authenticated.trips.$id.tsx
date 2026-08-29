import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Camera,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { AIContextActions } from "@/components/AIContextActions";
import { TripJourneyRail } from "@/components/TripJourneyRail";
// AI_CONTEXT_LAYER_V1_TRIP
// JOURNEY_CONTINUITY_V1_TRIP
import { TripDaySectionPremium } from "@/components/TripDaySectionPremium";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { finalizeTrip } from "@/lib/trip-finalize.functions";
import { resolvedDestinationCover } from "@/lib/destination-cover";
import { getSignedMediaUrl } from "@/lib/storage";
import { geocodePlaceLocation } from "@/lib/place-geocoding.functions";

export const Route = createFileRoute("/_authenticated/trips/$id")({
  component: TripDetail,
});

function TripDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const finalize = useServerFn(finalizeTrip);
  const [showRecap, setShowRecap] = useState(false);

  const { data: trip } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () =>
      (await supabase.from("trips").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: entries } = useQuery({
    queryKey: ["trip-entries", id],
    queryFn: async () =>
      (
        await supabase
          .from("trip_entries")
          .select("*")
          .eq("trip_id", id)
          .order("visited_on")
          .order("position")
      ).data ?? [],
  });

  const { data: expenses } = useQuery({
    queryKey: ["trip-expenses", id],
    queryFn: async () =>
      (
        await supabase
          .from("trip_expenses")
          .select("*")
          .eq("trip_id", id)
          .order("spent_on")
      ).data ?? [],
  });

  const { data: days } = useQuery({
    queryKey: ["trip-days", id],
    queryFn: async () =>
      (
        await supabase
          .from("trip_days")
          .select("*")
          .eq("trip_id", id)
          .order("day_date")
      ).data ?? [],
  });

  const dayList = useMemo(() => {
    const set = new Set<string>();
    (days ?? []).forEach((day) => set.add(day.day_date));
    (entries ?? []).forEach((entry) => entry.visited_on && set.add(entry.visited_on));
    (expenses ?? []).forEach((expense) => expense.spent_on && set.add(expense.spent_on));

    if (trip?.starts_on && trip?.ends_on) {
      const start = new Date(`${trip.starts_on}T12:00:00`);
      const end = new Date(`${trip.ends_on}T12:00:00`);
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        set.add(cursor.toISOString().slice(0, 10));
      }
    }

    return Array.from(set).sort();
  }, [days, entries, expenses, trip?.starts_on, trip?.ends_on]);

  const actualExpenses = useMemo(
    () => (expenses ?? []).filter((expense) => expense.category !== "Prévision IA+"),
    [expenses],
  );
  const forecastTotal = useMemo(
    () =>
      (expenses ?? [])
        .filter((expense) => expense.category === "Prévision IA+")
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [expenses],
  );
  const totalSpent = actualExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const budget = trip?.budget ? Number(trip.budget) : 0;
  const spentPct = budget ? Math.min(100, (totalSpent / budget) * 100) : 0;

  const doFinalize = useMutation({
    mutationFn: async () => finalize({ data: { tripId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      toast.success("Voyage finalisé ✨");
      setShowRecap(true);
    },
    onError: (error: any) => toast.error(error?.message ?? "Erreur"),
  });

  if (!trip) {
    return (
      <div className="app-page">
        <AppHeader />
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">
          Voyage introuvable.
        </div>
      </div>
    );
  }

  const finalized = !!trip.finalized_at;

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        <Link
          to="/trips"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Mon carnet
        </Link>

        <header className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
          <div className="relative aspect-[16/6] bg-muted">
            {trip.cover_url ? (
              <img
                src={resolvedDestinationCover(trip.cover_url, trip.country, trip.city)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center gradient-hero text-6xl text-white">🌍</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider opacity-90">
                <Badge className="border-0 bg-white/20 text-white backdrop-blur">
                  {finalized ? "🏁 Voyage terminé" : trip.status}
                </Badge>
                {trip.starts_on && (
                  <span>
                    {trip.starts_on} → {trip.ends_on ?? "?"}
                  </span>
                )}
              </div>
              <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl md:text-5xl">
                {trip.title}
              </h1>
              <p className="mt-1 flex items-center gap-1 text-sm opacity-90">
                <MapPin className="h-4 w-4" /> {[trip.city, trip.country].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            <QuickStat label="Étapes" value={String(entries?.length ?? 0)} />
            <QuickStat label="Jours" value={String(dayList.length || 0)} />
            <QuickStat
              label="Photos"
              value={String(
                (entries ?? []).reduce(
                  (count, entry) =>
                    count + (entry.media_urls?.length ?? 0) + (entry.image_url ? 1 : 0),
                  0,
                ),
              )}
            />
            <QuickStat label="Dépensé" value={`${totalSpent.toFixed(0)} €`} />
          </div>

          {budget > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" /> Budget réellement dépensé
                </span>
                <span className="tabular-nums">
                  {totalSpent.toFixed(2)} € / {budget.toFixed(0)} €
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full transition-all ${spentPct > 100 ? "bg-destructive" : "gradient-hero"}`}
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
              {forecastTotal > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">Prévision IA+ du voyage</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold tabular-nums text-primary">
                    {forecastTotal.toFixed(2)} € prévu
                  </span>
                </div>
              )}
            </div>
          )}
        </header>

        <TripJourneyRail
          tripId={id}
          tripTitle={trip.title}
          city={trip.city}
          country={trip.country}
          startsOn={trip.starts_on}
          endsOn={trip.ends_on}
          entryCount={entries?.length ?? 0}
        />

        {!finalized && (
          <section className="mt-4 overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] via-card to-cyan-500/[0.06] p-4 shadow-soft sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-violet-500">
                  <Sparkles className="h-4 w-4" /> GlobeLink IA dans ce voyage
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Demande un conseil rapide gratuitement, ou laisse IA+ lire ce carnet précis pour réorganiser tes journées, ton budget et tes étapes.
                </p>
              </div>
              <AIContextActions
                destination={[trip.city, trip.country].filter(Boolean).join(", ")}
                freePrompt={`Donne-moi des conseils généraux pour un voyage à ${[trip.city, trip.country].filter(Boolean).join(", ") || trip.title}, notamment pour organiser mes journées efficacement.`}
                proPrompt={`Analyse le voyage "${trip.title}" dans mon carnet GlobeLink et organise ou réorganise mes journées de façon réaliste, en réduisant les trajets et en respectant mon budget.`}
                proMode="plan"
                tripId={id}
                freeLabel="Conseil rapide"
                proLabel="Organiser ce voyage avec IA+"
                compact
              />
            </div>
          </section>
        )}

        {(entries ?? []).some((entry) => entry.lat != null && entry.lng != null) && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-display text-lg">🗺️ Parcours</h2>
              {finalized && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setShowRecap(true)}
                >
                  Voir le recap →
                </Button>
              )}
            </div>
            <div className="h-72 border-t border-border">
              <ClientOnly
                fallback={
                  <div className="grid h-full place-items-center text-muted-foreground">
                    Chargement…
                  </div>
                }
              >
                <TripRouteMap entries={entries ?? []} />
              </ClientOnly>
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-2xl">Ton journal de voyage</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Chaque journée est organisée clairement : programme, météo, humeur et budget au même endroit.
              </p>
            </div>
            {dayList.length > 0 && (
              <AddDayButton
                tripId={id}
                userId={user!.id}
                existing={dayList}
                startsOn={trip.starts_on}
                endsOn={trip.ends_on}
              />
            )}
          </div>

          <div className="mb-6 grid gap-2 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                1
              </span>
              <div>
                <p className="text-sm font-medium">Ajoute une journée</p>
                <p className="text-xs text-muted-foreground">Choisis simplement la date.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                2
              </span>
              <div>
                <p className="text-sm font-medium">Raconte ta journée</p>
                <p className="text-xs text-muted-foreground">Programme, photos, lieux et dépenses.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                3
              </span>
              <div>
                <p className="text-sm font-medium">Génère ton souvenir</p>
                <p className="text-xs text-muted-foreground">Finalise quand tout est prêt.</p>
              </div>
            </div>
          </div>

          {dayList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/40 p-6 text-center sm:p-10">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Camera className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-xl">Commence par ta première journée</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Choisis la date. Tu pourras ensuite ajouter ton programme, tes dépenses, la météo et tes souvenirs.
              </p>
              <div className="mt-5 flex justify-center">
                <AddDayButton
                  tripId={id}
                  userId={user!.id}
                  existing={dayList}
                  startsOn={trip.starts_on}
                  endsOn={trip.ends_on}
                  prominent
                />
              </div>
            </div>
          ) : (
            <div className="space-y-7">
              {dayList.map((date, index) => (
                <TripDaySectionPremium
                  key={date}
                  index={index + 1}
                  day={date}
                  tripId={id}
                  userId={user!.id}
                  meta={days?.find((item) => item.day_date === date)}
                  entries={(entries ?? []).filter((entry) => entry.visited_on === date)}
                  allEntries={entries ?? []}
                  expenses={(expenses ?? []).filter((expense) => expense.spent_on === date)}
                />
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft">
          {finalized ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">🏁</div>
              <h3 className="font-display text-2xl">Ce voyage est bouclé</h3>
              <p className="text-sm text-muted-foreground">
                Revis-le en un clic : parcours animé, résumé, statistiques et souvenirs.
              </p>
              <Button
                className="rounded-full gradient-hero text-primary-foreground shadow-soft"
                onClick={() => setShowRecap(true)}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Voir mon recap
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">✨</div>
              <h3 className="font-display text-2xl">Finaliser le voyage</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                {dayList.length === 0
                  ? "Ajoute au moins une journée avant de finaliser ton voyage."
                  : "Quand ton journal est prêt, on génère automatiquement le résumé, les statistiques, la carte animée et la vidéo souvenir."}
              </p>
              <Button
                className="rounded-full gradient-hero text-primary-foreground shadow-elevated"
                disabled={doFinalize.isPending || dayList.length === 0}
                onClick={() => doFinalize.mutate()}
              >
                {doFinalize.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Finaliser & générer le recap
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      <RecapDialog
        open={showRecap}
        onOpenChange={setShowRecap}
        trip={trip}
        entries={entries ?? []}
        expenses={expenses ?? []}
        days={days ?? []}
      />
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-4 text-center">
      <div className="font-display text-2xl">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function AddDayButton({
  tripId,
  userId,
  existing,
  startsOn,
  endsOn,
  prominent = false,
}: {
  tripId: string;
  userId: string;
  existing: string[];
  startsOn?: string | null;
  endsOn?: string | null;
  prominent?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const suggestedDate = useMemo(() => {
    const used = new Set(existing);
    const addDay = (value: string) => {
      const [year, month, date] = value.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
    };

    if (startsOn) {
      let candidate = startsOn;
      while (used.has(candidate) && (!endsOn || candidate < endsOn)) candidate = addDay(candidate);
      if (!used.has(candidate) && (!endsOn || candidate <= endsOn)) return candidate;
    }

    if (existing.length > 0) return addDay([...existing].sort().at(-1)!);
    return new Date().toISOString().slice(0, 10);
  }, [existing, startsOn, endsOn]);

  const [date, setDate] = useState(suggestedDate);

  const create = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Choisis une date pour cette journée.");
      if (existing.includes(date)) {
        const duplicate = new Error("Cette journée est déjà dans ton carnet.") as Error & { code?: string };
        duplicate.code = "DUPLICATE_DAY";
        throw duplicate;
      }

      const { error } = await supabase.from("trip_days").insert({
        trip_id: tripId,
        user_id: userId,
        day_date: date,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["trip-days", tripId] });
      toast.success("Journée ajoutée au carnet");
      setOpen(false);
    },
    onError: (error: any) => {
      if (error?.code === "23505" || error?.code === "DUPLICATE_DAY") {
        toast.error("Cette journée est déjà dans ton carnet.");
        return;
      }
      toast.error(error?.message ?? "Impossible d’ajouter cette journée. Réessaie.");
    },
  });

  const formatDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setDate(suggestedDate);
      }}
    >
      <DialogTrigger asChild>
        <Button
          size={prominent ? "default" : "sm"}
          variant={prominent ? "default" : "outline"}
          className={
            prominent
              ? "rounded-full gradient-hero px-6 text-primary-foreground shadow-soft"
              : "rounded-full"
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {prominent ? "Ajouter ma première journée" : "Ajouter une journée"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une journée au carnet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choisis la date de ta journée. Tu pourras ensuite y ajouter tes activités, notes et dépenses.
          </p>
          <label className="block text-sm font-medium" htmlFor={`trip-day-${tripId}`}>
            Date de la journée
          </label>
          <Input
            id={`trip-day-${tripId}`}
            type="date"
            value={date}
            min={startsOn ?? undefined}
            max={endsOn ?? undefined}
            onChange={(event) => setDate(event.target.value)}
          />
          {startsOn && endsOn && (
            <p className="text-xs text-muted-foreground">
              Dates du voyage : {formatDate(startsOn)} → {formatDate(endsOn)}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Annuler
          </Button>
          <Button
            className="rounded-full gradient-hero text-primary-foreground"
            disabled={!date || create.isPending || existing.includes(date)}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Ajout…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" /> Ajouter la journée
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TripRouteMap({ entries, zoomLevel = 4 }: { entries: any[]; zoomLevel?: number }) {
  const [Mod, setMod] = useState<typeof import("react-leaflet") | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([reactLeaflet, leaflet]) => {
      setL(leaflet);
      setMod(reactLeaflet);
    });
  }, []);

  const geo = entries.filter((entry) => entry.lat != null && entry.lng != null);
  if (!Mod || !L || geo.length === 0) {
    return (
      <div className="grid h-full place-items-center bg-secondary text-sm text-muted-foreground">
        Ajoute un lieu à un souvenir pour afficher ton parcours
      </div>
    );
  }

  const { MapContainer, Marker, Polyline, TileLayer } = Mod;
  const center: [number, number] = [geo[0].lat, geo[0].lng];
  const path = geo.map((entry) => [entry.lat, entry.lng] as [number, number]);

  return (
    <MapContainer center={center} zoom={zoomLevel} className="h-full w-full" scrollWheelZoom={false}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <Polyline positions={path} pathOptions={{ color: "#0ea5e9", weight: 3, dashArray: "6 6" }} />
      {geo.map((entry, index) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:oklch(0.7 0.15 220);color:white;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);">${index + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        return <Marker key={entry.id} position={[entry.lat, entry.lng]} icon={icon} />;
      })}
    </MapContainer>
  );
}

// recap-media-map-fix
async function geocodeRecapLocation(city?: string | null, country?: string | null) {
  const query = [city, country].filter(Boolean).join(", ").trim();
  if (!query) return null;
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`,
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: Array<{ latitude: number; longitude: number; country?: string; name?: string }>;
    };
    const requestedCountry = String(country ?? "").trim().toLocaleLowerCase("fr");
    const result =
      payload.results?.find((item) =>
        requestedCountry ? String(item.country ?? "").toLocaleLowerCase("fr").includes(requestedCountry) : true,
      ) ?? payload.results?.[0];
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;
    return { lat: Number(result.latitude), lng: Number(result.longitude) };
  } catch {
    return null;
  }
}

function RecapDialog({
  open,
  onOpenChange,
  trip,
  entries,
  expenses,
  days,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  trip: any;
  entries: any[];
  expenses: any[];
  days: any[];
}) {
  const stats = (trip?.stats as any) ?? {};
  const recapGeocode = useServerFn(geocodePlaceLocation);
  const resolveRecapCoords = async (city?: string | null, country?: string | null) => {
    const rawCity = String(city ?? "").trim();
    const parts = rawCity.split(",").map((part) => part.trim()).filter(Boolean);
    const normalizedCity = parts[0] || String(trip?.city ?? "").trim();
    const normalizedCountry =
      String(country ?? "").trim() ||
      (parts.length > 1 ? parts[parts.length - 1] : "") ||
      String(trip?.country ?? "").trim();

    if (normalizedCity && normalizedCountry) {
      try {
        const result = await recapGeocode({ data: { city: normalizedCity, country: normalizedCountry } });
        if (Number.isFinite(result?.lat) && Number.isFinite(result?.lng)) {
          return { lat: Number(result.lat), lng: Number(result.lng) };
        }
      } catch {
        // Fall back to the lightweight browser geocoder below.
      }
    }

    return geocodeRecapLocation(normalizedCity || city, normalizedCountry || country);
  };
  const actualExpenseTotal = useMemo(
    () =>
      expenses
        .filter((expense) => expense.category !== "Prévision IA+")
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    [expenses],
  );
  const photos = useMemo(() => {
    const all: string[] = [];
    entries.forEach((entry) => {
      (entry.media_urls ?? []).forEach((media: string) => {
        if (!/\.(mp4|webm|mov)(?:$|\?)/i.test(media) && !all.includes(media)) all.push(media);
      });
      if (entry.image_url && !all.includes(entry.image_url)) all.push(entry.image_url);
    });
    return all.slice(0, 12);
  }, [entries]);
  const [resolvedPhotos, setResolvedPhotos] = useState<string[]>([]);
  const [mapEntries, setMapEntries] = useState<any[]>(entries);
  const coverFallback = useMemo(
    () => resolvedDestinationCover(trip?.cover_url, trip?.country, trip?.city),
    [trip?.cover_url, trip?.country, trip?.city],
  );
  const heroImages = resolvedPhotos.length > 0 ? resolvedPhotos : coverFallback ? [coverFallback] : [];

  useEffect(() => {
    let active = true;
    if (!open || photos.length === 0) {
      setResolvedPhotos([]);
      return () => { active = false; };
    }
    void Promise.all(photos.map((photo) => getSignedMediaUrl(photo))).then((urls) => {
      if (!active) return;
      setResolvedPhotos(urls.filter((url): url is string => Boolean(url)));
    });
    return () => { active = false; };
  }, [open, photos]);

  useEffect(() => {
    let active = true;
    if (!open) return () => { active = false; };

    void (async () => {
      const enriched = await Promise.all(
        entries.map(async (entry) => {
          if (entry.lat != null && entry.lng != null) return entry;
          if (!entry.city && !entry.country) return entry;
          const coords = await resolveRecapCoords(entry.city, entry.country);
          if (!coords) return entry;
          void supabase
            .from("trip_entries")
            .update(coords)
            .eq("id", entry.id)
            .eq("trip_id", trip.id)
            .then(() => undefined);
          return { ...entry, ...coords };
        }),
      );

      if (!enriched.some((entry) => entry.lat != null && entry.lng != null)) {
        const fallback = await resolveRecapCoords(trip.city, trip.country);
        if (fallback) {
          enriched.push({
            id: `trip-destination-${trip.id}`,
            title: trip.title,
            city: trip.city,
            country: trip.country,
            ...fallback,
          });
        }
      }

      if (active) setMapEntries(enriched);
    })();

    return () => { active = false; };
  }, [open, entries, trip.id, trip.title, trip.city, trip.country]);

  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    setSlideIdx(0);
    if (!open || heroImages.length <= 1) return;
    const timer = setInterval(() => setSlideIdx((index) => (index + 1) % heroImages.length), 2500);
    return () => clearInterval(timer);
  }, [open, heroImages.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
        <div className="relative aspect-[16/9] overflow-hidden bg-black">
          <div className="absolute inset-0 grid place-items-center gradient-hero text-6xl text-white">🌍</div>
          {heroImages.map((photo, index) => (
            <img
              key={`recap-hero-${photo}-${index}`}
              src={photo}
              alt=""
              onError={(event) => { event.currentTarget.style.display = "none"; }}
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${
                index === slideIdx ? "scale-105 opacity-100" : "scale-100 opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white">
            <div className="text-xs uppercase tracking-[0.3em] opacity-80">Ton souvenir</div>
            <h2 className="mt-1 font-display text-4xl">{trip.title}</h2>
            <p className="opacity-80">{[trip.city, trip.country].filter(Boolean).join(", ")}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
          <RecapStat label="Distance" value={`${stats.distance_km ?? 0} km`} icon="🛣️" />
          <RecapStat label="Pays" value={String(stats.countries_count ?? 1)} icon="🌍" />
          <RecapStat label="Étapes" value={String(stats.entries_count ?? entries.length)} icon="📍" />
          <RecapStat label="Jours" value={String(stats.days_count ?? days.length)} icon="📅" />
          <RecapStat label="Photos" value={String(stats.photos_count ?? photos.length)} icon="📸" />
          <RecapStat
            label="Dépensé"
            value={`${actualExpenseTotal.toFixed(0)} €`}
            icon="💶"
          />
          <RecapStat label="Activités" value={String(stats.activities_count ?? 0)} icon="⚡" />
          <RecapStat label="Restos" value={String(stats.restaurants_count ?? 0)} icon="🍽️" />
        </div>

        <div className="mx-6 h-64 overflow-hidden rounded-2xl border border-border">
          <ClientOnly fallback={<div className="h-full bg-secondary" />}>
            <TripRouteMap entries={mapEntries} zoomLevel={4} />
          </ClientOnly>
        </div>

        {trip.summary && (
          <div className="p-6">
            <h3 className="mb-3 flex items-center gap-2 font-display text-2xl">
              <Sparkles className="h-5 w-5 text-accent" /> Résumé
            </h3>
            <div className="md-body prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{trip.summary}</ReactMarkdown>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecapStat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <div className="text-xl">{icon}</div>
      <div className="mt-1 font-display text-xl">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
