import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, MapPin, Plus, Wallet, Trash2, Sparkles, Camera, UtensilsCrossed,
  Bed, Activity, Bus, StickyNote, CloudSun, Star, Image as ImageIcon, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { finalizeTrip } from "@/lib/trip-finalize.functions";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/trips/$id")({
  component: TripDetail,
});

const KINDS = [
  { value: "activity",  label: "Activité",   icon: Activity,          color: "bg-primary/10 text-primary" },
  { value: "restaurant",label: "Restaurant", icon: UtensilsCrossed,   color: "bg-orange-500/10 text-orange-500" },
  { value: "hotel",     label: "Hébergement",icon: Bed,               color: "bg-purple-500/10 text-purple-500" },
  { value: "photo",     label: "Photo",      icon: ImageIcon,         color: "bg-pink-500/10 text-pink-500" },
  { value: "note",      label: "Note",       icon: StickyNote,        color: "bg-amber-500/10 text-amber-500" },
  { value: "transport", label: "Transport",  icon: Bus,               color: "bg-sky-500/10 text-sky-500" },
  { value: "stop",      label: "Étape",      icon: MapPin,            color: "bg-accent/10 text-accent" },
] as const;

const WEATHER_ICONS = ["☀️", "⛅️", "☁️", "🌧️", "⛈️", "🌫️", "❄️", "🌈"];
const MOODS = ["😍", "😊", "🤩", "😌", "🥲", "😅", "🥶", "🌊"];

function TripDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  
  const finalize = useServerFn(finalizeTrip);
  const [showRecap, setShowRecap] = useState(false);

  const { data: trip } = useQuery({
    queryKey: ["trip", id],
    queryFn: async () => (await supabase.from("trips").select("*").eq("id", id).maybeSingle()).data,
  });

  const { data: entries } = useQuery({
    queryKey: ["trip-entries", id],
    queryFn: async () => (await supabase.from("trip_entries").select("*").eq("trip_id", id).order("visited_on").order("position")).data ?? [],
  });

  const { data: expenses } = useQuery({
    queryKey: ["trip-expenses", id],
    queryFn: async () => (await supabase.from("trip_expenses").select("*").eq("trip_id", id).order("spent_on")).data ?? [],
  });

  const { data: days } = useQuery({
    queryKey: ["trip-days", id],
    queryFn: async () => (await supabase.from("trip_days").select("*").eq("trip_id", id).order("day_date")).data ?? [],
  });

  // Build day buckets from starts_on/ends_on OR from unique visited_on
  const dayList = useMemo(() => {
    const set = new Set<string>();
    (days ?? []).forEach((d) => set.add(d.day_date));
    (entries ?? []).forEach((e) => e.visited_on && set.add(e.visited_on));
    (expenses ?? []).forEach((e) => e.spent_on && set.add(e.spent_on));
    if (trip?.starts_on && trip?.ends_on) {
      const s = new Date(trip.starts_on); const e = new Date(trip.ends_on);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) set.add(d.toISOString().slice(0, 10));
    }
    return Array.from(set).sort();
  }, [days, entries, expenses, trip?.starts_on, trip?.ends_on]);

  const totalSpent = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const budget = trip?.budget ? Number(trip.budget) : 0;
  const spentPct = budget ? Math.min(100, (totalSpent / budget) * 100) : 0;

  const doFinalize = useMutation({
    mutationFn: async () => finalize({ data: { tripId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      toast.success("Voyage finalisé ✨");
      setShowRecap(true);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  if (!trip) return (
    <div className="app-page"><AppHeader />
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-muted-foreground">Voyage introuvable.</div>
    </div>
  );

  const finalized = !!trip.finalized_at;

  return (
    <div className="app-page">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Mon carnet
        </Link>

        {/* Hero */}
        <header className="mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
          <div className="relative aspect-[16/6] bg-muted">
            {trip.cover_url
              ? <img src={trip.cover_url} alt="" className="h-full w-full object-cover" />
              : <div className="grid h-full place-items-center gradient-hero text-6xl text-white">🌍</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider opacity-90">
                <Badge className="bg-white/20 backdrop-blur border-0 text-white">{finalized ? "🏁 Voyage terminé" : trip.status}</Badge>
                {trip.starts_on && <span>{trip.starts_on} → {trip.ends_on ?? "?"}</span>}
              </div>
              <h1 className="mt-2 font-display text-4xl leading-tight md:text-5xl">{trip.title}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm opacity-90"><MapPin className="h-4 w-4" /> {[trip.city, trip.country].filter(Boolean).join(", ")}</p>
            </div>
          </div>

          {/* Quick stats bar */}
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            <QuickStat label="Étapes" value={String(entries?.length ?? 0)} />
            <QuickStat label="Jours" value={String(dayList.length || 0)} />
            <QuickStat label="Photos" value={String((entries ?? []).reduce((n, e) => n + (e.media_urls?.length ?? 0) + (e.image_url ? 1 : 0), 0))} />
            <QuickStat label="Dépensé" value={`${totalSpent.toFixed(0)} €`} />
          </div>

          {budget > 0 && (
            <div className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> Budget</span>
                <span className="tabular-nums">{totalSpent.toFixed(2)} € / {budget.toFixed(0)} €</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full ${spentPct > 100 ? "bg-destructive" : "gradient-hero"} transition-all`} style={{ width: `${Math.min(100, spentPct)}%` }} />
              </div>
            </div>
          )}
        </header>

        {/* Global route map */}
        {(entries ?? []).some((e) => e.lat != null && e.lng != null) && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-display text-lg">🗺️ Parcours</h2>
              {finalized && (
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setShowRecap(true)}>
                  Voir le recap →
                </Button>
              )}
            </div>
            <div className="h-72 border-t border-border">
              <ClientOnly fallback={<div className="grid h-full place-items-center text-muted-foreground">Chargement…</div>}>
                <TripRouteMap entries={entries ?? []} />
              </ClientOnly>
            </div>
          </section>
        )}

        {/* Day list */}
        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl">Journal jour par jour</h2>
              <p className="text-sm text-muted-foreground">{dayList.length} jour{dayList.length > 1 ? "s" : ""} · météo, photos, dépenses & souvenirs.</p>
            </div>
            <AddDayButton tripId={id} userId={user!.id} existing={dayList} />
          </div>

          {dayList.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-10 text-center text-muted-foreground">
              <Camera className="mx-auto mb-2 h-6 w-6" />
              Commence ton carnet : ajoute une première journée.
            </div>
          ) : (
            <div className="space-y-6">
              {dayList.map((d, i) => (
                <DaySection
                  key={d}
                  index={i + 1}
                  day={d}
                  tripId={id}
                  userId={user!.id}
                  meta={days?.find((x) => x.day_date === d)}
                  entries={(entries ?? []).filter((e) => e.visited_on === d)}
                  expenses={(expenses ?? []).filter((e) => e.spent_on === d)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Finalize */}
        <div className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft">
          {finalized ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">🏁</div>
              <h3 className="font-display text-2xl">Ce voyage est bouclé</h3>
              <p className="text-sm text-muted-foreground">Revis-le en un clic : parcours animé, résumé, statistiques et souvenirs.</p>
              <Button className="rounded-full gradient-hero text-primary-foreground shadow-soft" onClick={() => setShowRecap(true)}>
                <Sparkles className="mr-2 h-4 w-4" /> Voir mon recap
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">✨</div>
              <h3 className="font-display text-2xl">Finaliser le voyage</h3>
              <p className="max-w-md text-sm text-muted-foreground">On génère automatiquement le résumé, les statistiques, la carte animée et la vidéo souvenir.</p>
              <Button
                className="rounded-full gradient-hero text-primary-foreground shadow-elevated"
                disabled={doFinalize.isPending}
                onClick={() => doFinalize.mutate()}
              >
                {doFinalize.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Génération…</> : <><Sparkles className="mr-2 h-4 w-4" /> Finaliser & générer le recap</>}
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

/* -------- Day section -------- */
function DaySection({
  index, day, tripId, userId, meta, entries, expenses,
}: {
  index: number;
  day: string;
  tripId: string;
  userId: string;
  meta?: any;
  entries: any[];
  expenses: any[];
}) {
  const qc = useQueryClient();
  const daySpent = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const geoEntries = entries.filter((e) => e.lat != null && e.lng != null);

  const upsertDay = async (patch: Record<string, any>) => {
    const { error } = await supabase.from("trip_days").upsert(
      { trip_id: tripId, user_id: userId, day_date: day, ...patch },
      { onConflict: "trip_id,day_date" },
    );
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["trip-days", tripId] });
  };

  return (
    <article className="animate-rise overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {/* Day header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-secondary/30 p-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl gradient-hero text-lg font-bold text-white shadow-soft">J{index}</div>
        <div className="min-w-0 flex-1">
          <input
            defaultValue={meta?.headline ?? ""}
            placeholder="Titre de la journée…"
            className="w-full bg-transparent font-display text-xl outline-none placeholder:text-muted-foreground/60"
            onBlur={(e) => e.target.value !== (meta?.headline ?? "") && upsertDay({ headline: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">{new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>

        {/* Weather quick pick */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1">
          <CloudSun className="h-4 w-4 text-muted-foreground" />
          <select
            value={meta?.weather_icon ?? ""}
            onChange={(e) => upsertDay({ weather_icon: e.target.value })}
            className="bg-transparent text-sm outline-none"
          >
            <option value="">—</option>
            {WEATHER_ICONS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <input
            type="number"
            step="0.5"
            defaultValue={meta?.weather_temp ?? ""}
            placeholder="°"
            className="w-12 bg-transparent text-sm outline-none"
            onBlur={(e) => e.target.value !== String(meta?.weather_temp ?? "") && upsertDay({ weather_temp: e.target.value ? Number(e.target.value) : null })}
          />
          <span className="text-xs text-muted-foreground">°C</span>
        </div>

        {/* Mood */}
        <select
          value={meta?.mood ?? ""}
          onChange={(e) => upsertDay({ mood: e.target.value })}
          className="rounded-full border border-border bg-card px-3 py-1 text-lg"
        >
          <option value="">😐</option>
          {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </header>

      {/* Mini map */}
      {geoEntries.length > 0 && (
        <div className="h-48 border-b border-border">
          <ClientOnly fallback={<div className="h-full bg-secondary" />}>
            <TripRouteMap entries={geoEntries} zoomLevel={11} />
          </ClientOnly>
        </div>
      )}

      {/* Entries grouped by kind */}
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {KINDS.filter((k) => k.value !== "stop").map((k) => {
          const items = entries.filter((e) => e.kind === k.value);
          if (items.length === 0) return null;
          const Icon = k.icon;
          return (
            <div key={k.value} className="space-y-2">
              <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${k.color}`}>
                <Icon className="h-3.5 w-3.5" /> {k.label} · {items.length}
              </div>
              {items.map((e) => <EntryCard key={e.id} entry={e} tripId={tripId} />)}
            </div>
          );
        })}
        {entries.filter((e) => e.kind === "stop").map((e) => <EntryCard key={e.id} entry={e} tripId={tripId} className="md:col-span-2" />)}
      </div>

      {/* Notes free text */}
      <div className="border-t border-border px-4 py-3">
        <Textarea
          rows={2}
          defaultValue={meta?.notes ?? ""}
          placeholder="Notes de la journée, souvenirs, sensations…"
          className="resize-none border-0 bg-transparent focus-visible:ring-0"
          onBlur={(e) => e.target.value !== (meta?.notes ?? "") && upsertDay({ notes: e.target.value })}
        />
      </div>

      {/* Expenses + add */}
      <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/20 p-3">
        <span className="mr-auto flex items-center gap-1 text-sm">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <span className="tabular-nums font-medium">{daySpent.toFixed(2)} €</span>
          <span className="text-xs text-muted-foreground">· {expenses.length} dépense{expenses.length > 1 ? "s" : ""}</span>
        </span>
        <AddExpenseButton tripId={tripId} userId={userId} day={day} />
        <AddEntryButton tripId={tripId} userId={userId} day={day} />
      </footer>

      {expenses.length > 0 && (
        <ul className="divide-y divide-border border-t border-border text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-4 py-2">
              <span className="flex-1 truncate">{e.label}</span>
              {e.category && <span className="text-xs text-muted-foreground">{e.category}</span>}
              <span className="tabular-nums font-medium">{Number(e.amount).toFixed(2)} €</span>
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => { await supabase.from("trip_expenses").delete().eq("id", e.id); qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] }); }}
              ><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/* -------- Entry card -------- */
function EntryCard({ entry, tripId, className = "" }: { entry: any; tripId: string; className?: string }) {
  const qc = useQueryClient();
  const media = (entry.media_urls?.length ? entry.media_urls : entry.image_url ? [entry.image_url] : []) as string[];
  return (
    <div className={`overflow-hidden rounded-2xl border border-border bg-background transition hover:shadow-soft ${className}`}>
      {media.length > 0 && (
        <div className="flex gap-1 overflow-x-auto">
          {media.map((m, i) => (
            <img key={i} src={m} alt="" className="aspect-square w-24 shrink-0 object-cover" />
          ))}
        </div>
      )}
      {entry.video_url && (
        <video src={entry.video_url} controls className="aspect-video w-full bg-black" />
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate font-medium">{entry.title}</h4>
            {(entry.city || entry.country) && <p className="truncate text-xs text-muted-foreground">{[entry.city, entry.country].filter(Boolean).join(", ")}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            {entry.rating && <span className="flex items-center gap-0.5 text-amber-500"><Star className="h-3 w-3 fill-current" /> {entry.rating}</span>}
            {entry.price_level && <span className="text-muted-foreground">{"€".repeat(entry.price_level)}</span>}
            <button
              className="text-muted-foreground hover:text-destructive"
              onClick={async () => { await supabase.from("trip_entries").delete().eq("id", entry.id); qc.invalidateQueries({ queryKey: ["trip-entries", tripId] }); }}
            ><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        {entry.notes && <p className="mt-1.5 text-sm text-foreground/90">{entry.notes}</p>}
      </div>
    </div>
  );
}

/* -------- Add entry dialog -------- */
function AddEntryButton({ tripId, userId, day }: { tripId: string; userId: string; day: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "activity", title: "", city: "", country: "", lat: "", lng: "", notes: "", image_url: "", video_url: "", rating: "", price_level: "" });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trip_entries").insert({
        trip_id: tripId, user_id: userId,
        kind: f.kind, title: f.title,
        city: f.city || null, country: f.country || null,
        lat: f.lat ? Number(f.lat) : null, lng: f.lng ? Number(f.lng) : null,
        notes: f.notes || null,
        image_url: f.image_url || null,
        media_urls: f.image_url ? [f.image_url] : [],
        video_url: f.video_url || null,
        rating: f.rating ? Number(f.rating) : null,
        price_level: f.price_level ? Number(f.price_level) : null,
        visited_on: day,
        position: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
      setOpen(false);
      setF({ kind: "activity", title: "", city: "", country: "", lat: "", lng: "", notes: "", image_url: "", video_url: "", rating: "", price_level: "" });
      toast.success("Ajouté à ta journée");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full gradient-hero text-primary-foreground"><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle étape · {new Date(day).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Titre *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Ville" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            <Input placeholder="Pays" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Latitude" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} />
            <Input placeholder="Longitude" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value })} />
          </div>
          <Input placeholder="URL photo (https://…)" value={f.image_url} onChange={(e) => setF({ ...f, image_url: e.target.value })} />
          <Input placeholder="URL vidéo (mp4)" value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Note /5" type="number" min="1" max="5" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} />
            <Input placeholder="Prix (1-4)" type="number" min="1" max="4" value={f.price_level} onChange={(e) => setF({ ...f, price_level: e.target.value })} />
          </div>
          <Textarea placeholder="Notes, ressenti, souvenirs…" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button disabled={!f.title || create.isPending} onClick={() => create.mutate()} className="rounded-full gradient-hero text-primary-foreground">Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Add expense -------- */
function AddExpenseButton({ tripId, userId, day }: { tripId: string; userId: string; day: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "", amount: "", category: "" });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trip_expenses").insert({
        trip_id: tripId, user_id: userId,
        label: f.label, amount: Number(f.amount), category: f.category || null,
        spent_on: day,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
      setOpen(false); setF({ label: "", amount: "", category: "" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full"><Wallet className="mr-1 h-3.5 w-3.5" /> Dépense</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle dépense</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="Libellé" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <Input placeholder="Montant (€)" type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <Input placeholder="Catégorie (transport, food…)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        </div>
        <DialogFooter>
          <Button disabled={!f.label || !f.amount || create.isPending} onClick={() => create.mutate()} className="rounded-full gradient-hero text-primary-foreground">Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Add day -------- */
function AddDayButton({ tripId, userId, existing }: { tripId: string; userId: string; existing: string[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full"><Plus className="mr-1 h-4 w-4" /> Ajouter une journée</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouvelle journée</DialogTitle></DialogHeader>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <DialogFooter>
          <Button
            className="rounded-full gradient-hero text-primary-foreground"
            onClick={async () => {
              if (existing.includes(date)) { toast.info("Journée déjà présente"); setOpen(false); return; }
              await supabase.from("trip_days").upsert({ trip_id: tripId, user_id: userId, day_date: date }, { onConflict: "trip_id,day_date" });
              qc.invalidateQueries({ queryKey: ["trip-days", tripId] });
              setOpen(false);
            }}
          >Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Route Map (Leaflet) -------- */
function TripRouteMap({ entries, zoomLevel = 4 }: { entries: any[]; zoomLevel?: number }) {
  const [Mod, setMod] = useState<typeof import("react-leaflet") | null>(null);
  const [L, setL] = useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([rl, leaf]) => {
      setL(leaf); setMod(rl);
    });
  }, []);

  const geo = entries.filter((e) => e.lat != null && e.lng != null);
  if (!Mod || !L || geo.length === 0) return <div className="grid h-full place-items-center bg-secondary text-muted-foreground text-sm">Aucun lieu géolocalisé</div>;

  const { MapContainer, TileLayer, Marker, Polyline } = Mod;
  const center: [number, number] = [geo[0].lat, geo[0].lng];
  const path = geo.map((e) => [e.lat, e.lng] as [number, number]);

  return (
    <MapContainer center={center} zoom={zoomLevel} className="h-full w-full" scrollWheelZoom={false}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      <Polyline positions={path} pathOptions={{ color: "#0ea5e9", weight: 3, dashArray: "6 6" }} />
      {geo.map((e, i) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:999px;background:oklch(0.7 0.15 220);color:white;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);">${i + 1}</div>`,
          iconSize: [28, 28], iconAnchor: [14, 14],
        });
        return <Marker key={e.id} position={[e.lat, e.lng]} icon={icon} />;
      })}
    </MapContainer>
  );
}

/* -------- Recap dialog -------- */
function RecapDialog({
  open, onOpenChange, trip, entries, expenses, days,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  trip: any; entries: any[]; expenses: any[]; days: any[];
}) {
  const stats = (trip?.stats as any) ?? {};
  const photos = useMemo(() => {
    const all: string[] = [];
    entries.forEach((e) => {
      (e.media_urls ?? []).forEach((m: string) => all.push(m));
      if (e.image_url && !all.includes(e.image_url)) all.push(e.image_url);
    });
    return all.slice(0, 12);
  }, [entries]);

  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => {
    if (!open || photos.length === 0) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % photos.length), 2500);
    return () => clearInterval(t);
  }, [open, photos.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Souvenir slideshow */}
        <div className="relative aspect-[16/9] overflow-hidden bg-black">
          {photos.length > 0 ? photos.map((p, i) => (
            <img
              key={i}
              src={p}
              alt=""
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${i === slideIdx ? "opacity-100 scale-105" : "opacity-0 scale-100"}`}
              style={{ animation: i === slideIdx ? "kenburns 3s ease-out" : undefined }}
            />
          )) : (
            <div className="grid h-full place-items-center gradient-hero text-6xl text-white">🎞️</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white">
            <div className="text-xs uppercase tracking-[0.3em] opacity-80">Ton souvenir</div>
            <h2 className="mt-1 font-display text-4xl">{trip.title}</h2>
            <p className="opacity-80">{[trip.city, trip.country].filter(Boolean).join(", ")}</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-4">
          <RecapStat label="Distance" value={`${stats.distance_km ?? 0} km`} icon="🛣️" />
          <RecapStat label="Pays" value={String(stats.countries_count ?? 1)} icon="🌍" />
          <RecapStat label="Étapes" value={String(stats.entries_count ?? entries.length)} icon="📍" />
          <RecapStat label="Jours" value={String(stats.days_count ?? days.length)} icon="📅" />
          <RecapStat label="Photos" value={String(stats.photos_count ?? photos.length)} icon="📸" />
          <RecapStat label="Dépensé" value={`${(stats.expenses_total ?? 0).toFixed?.(0) ?? stats.expenses_total ?? 0} €`} icon="💶" />
          <RecapStat label="Activités" value={String(stats.activities_count ?? 0)} icon="⚡" />
          <RecapStat label="Restos" value={String(stats.restaurants_count ?? 0)} icon="🍽️" />
        </div>

        {/* Animated route */}
        <div className="mx-6 h-64 overflow-hidden rounded-2xl border border-border">
          <ClientOnly fallback={<div className="h-full bg-secondary" />}>
            <TripRouteMap entries={entries} zoomLevel={4} />
          </ClientOnly>
        </div>

        {/* Summary */}
        {trip.summary && (
          <div className="p-6">
            <h3 className="mb-3 flex items-center gap-2 font-display text-2xl"><Sparkles className="h-5 w-5 text-accent" /> Résumé</h3>
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
