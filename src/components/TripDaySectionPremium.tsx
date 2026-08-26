import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bed,
  Bus,
  CalendarDays,
  ChevronRight,
  CloudSun,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MoonStar,
  Plus,
  StickyNote,
  Sun,
  Sunrise,
  Ticket,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WEATHER = [
  { icon: "☀️", label: "Ensoleillé" },
  { icon: "⛅️", label: "Clair" },
  { icon: "☁️", label: "Nuageux" },
  { icon: "🌧️", label: "Pluie" },
  { icon: "⛈️", label: "Orage" },
  { icon: "🌫️", label: "Brume" },
  { icon: "❄️", label: "Neige" },
] as const;

const MOODS = [
  { icon: "😍", label: "Génial" },
  { icon: "😊", label: "Content" },
  { icon: "🤩", label: "Incroyable" },
  { icon: "😌", label: "Détendu" },
  { icon: "🥲", label: "Ému" },
  { icon: "😅", label: "Intense" },
  { icon: "🥶", label: "Froid" },
  { icon: "🌊", label: "Chill" },
] as const;

const ENTRY_KINDS = [
  { value: "activity", label: "Activité", icon: Activity },
  { value: "restaurant", label: "Restaurant", icon: UtensilsCrossed },
  { value: "hotel", label: "Hébergement", icon: Bed },
  { value: "photo", label: "Photo", icon: ImageIcon },
  { value: "note", label: "Note", icon: StickyNote },
  { value: "transport", label: "Transport", icon: Bus },
  { value: "stop", label: "Étape", icon: MapPin },
] as const;

type Props = {
  index: number;
  day: string;
  tripId: string;
  userId: string;
  meta?: any;
  entries: any[];
  expenses: any[];
};

type ProgramSection = {
  key: "morning" | "afternoon" | "evening" | "other";
  title: string;
  items: string[];
};

function normalizeProgramTitle(value: string): ProgramSection["key"] {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.includes("matin")) return "morning";
  if (text.includes("apres-midi") || text.includes("midi")) return "afternoon";
  if (text.includes("soir") || text.includes("fin d'apres-midi")) return "evening";
  return "other";
}

function cleanMarkdownLine(value: string) {
  return value
    .replace(/^\s*[-*•]+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProgram(raw: string | null | undefined): ProgramSection[] {
  if (!raw) return [];
  const relevant = raw
    .replace(/\r/g, "")
    .split(/\n\s*---\s*\n\s*##\s*(?:Budget|Impact sur ton carnet|À vérifier|A vérifier)/i)[0];

  const sections: ProgramSection[] = [];
  let current: ProgramSection | null = null;

  for (const original of relevant.split("\n")) {
    const line = cleanMarkdownLine(original);
    if (!line) continue;

    const heading = line.match(
      /^(Matin|Après-midi|Apres-midi|Midi|Soir|Fin d['’]après-midi|Fin d['’]apres-midi)\s*:\s*(.*)$/i,
    );
    if (heading) {
      const title = heading[1]
        .replace(/Apres/i, "Après")
        .replace(/apres/i, "après");
      current = { key: normalizeProgramTitle(title), title, items: [] };
      sections.push(current);
      const tail = cleanMarkdownLine(heading[2]);
      if (tail) current.items.push(tail);
      continue;
    }

    if (!current) {
      current = { key: "other", title: "Programme", items: [] };
      sections.push(current);
    }
    current.items.push(line);
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => item.replace(/^[:;,.\-–—]+\s*/, "").trim())
        .filter(Boolean),
    }))
    .filter((section) => section.items.length > 0);
}

function weatherFromCode(code: number) {
  if (code === 0) return WEATHER[0];
  if ([1, 2].includes(code)) return WEATHER[1];
  if (code === 3) return WEATHER[2];
  if ([45, 48].includes(code)) return WEATHER[5];
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return WEATHER[3];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return WEATHER[6];
  if ([95, 96, 99].includes(code)) return WEATHER[4];
  return WEATHER[1];
}

function weatherLabel(icon?: string | null) {
  return WEATHER.find((item) => item.icon === icon)?.label ?? "Météo";
}

function moodLabel(icon?: string | null) {
  return MOODS.find((item) => item.icon === icon)?.label ?? "Humeur";
}

function expenseIcon(label: string) {
  if (/restauration|restaurant|repas/i.test(label)) return UtensilsCrossed;
  if (/transport|trajet|déplacement/i.test(label)) return Bus;
  return Ticket;
}

export function TripDaySectionPremium({ index, day, tripId, userId, meta, entries, expenses }: Props) {
  const qc = useQueryClient();
  const [weatherLoading, setWeatherLoading] = useState(false);
  const daySpent = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const aiNote = useMemo(
    () =>
      entries.find(
        (entry) =>
          entry.kind === "note" &&
          (/^IA\+\s*·\s*Jour/i.test(String(entry.title ?? "")) || /\*\*Matin/i.test(String(entry.notes ?? ""))),
      ),
    [entries],
  );
  const program = useMemo(() => parseProgram(aiNote?.notes), [aiNote?.notes]);
  const otherEntries = useMemo(() => entries.filter((entry) => entry.id !== aiNote?.id), [entries, aiNote?.id]);
  const noteCount = entries.filter((entry) => entry.kind === "note").length + (meta?.notes ? 1 : 0);

  const upsertDay = async (patch: Record<string, any>) => {
    const { error } = await supabase
      .from("trip_days")
      .upsert(
        { trip_id: tripId, user_id: userId, day_date: day, ...patch },
        { onConflict: "trip_id,day_date" },
      );
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["trip-days", tripId] });
  };

  useEffect(() => {
    if ((meta?.weather_icon && meta?.weather_temp != null) || weatherLoading) return;
    let cancelled = false;

    const loadWeather = async () => {
      setWeatherLoading(true);
      try {
        const { data: trip } = await supabase
          .from("trips")
          .select("city,country")
          .eq("id", tripId)
          .maybeSingle();
        const destination = String(trip?.city || trip?.country || "").trim();
        if (!destination) return;

        const geocode = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=fr&format=json`,
        );
        if (!geocode.ok) return;
        const geoPayload = (await geocode.json()) as {
          results?: Array<{ latitude: number; longitude: number }>;
        };
        const point = geoPayload.results?.[0];
        if (!point) return;

        const forecast = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${day}&end_date=${day}`,
        );
        if (!forecast.ok) return;
        const payload = (await forecast.json()) as {
          daily?: {
            weather_code?: number[];
            temperature_2m_max?: number[];
            temperature_2m_min?: number[];
          };
        };
        const code = payload.daily?.weather_code?.[0];
        const max = payload.daily?.temperature_2m_max?.[0];
        const min = payload.daily?.temperature_2m_min?.[0];
        if (cancelled || code == null || max == null) return;

        const weather = weatherFromCode(Number(code));
        const temperature = Math.round(Number.isFinite(Number(min)) ? (Number(max) + Number(min)) / 2 : Number(max));
        await upsertDay({ weather_icon: weather.icon, weather_temp: temperature });
      } catch {
        // The journal remains editable manually if the forecast service is temporarily unavailable.
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    void loadWeather();
    return () => {
      cancelled = true;
    };
    // Only retry when the day itself or stored weather changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, tripId, meta?.weather_icon, meta?.weather_temp]);

  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <article className="animate-rise overflow-hidden rounded-[2rem] border border-border/80 bg-card shadow-soft">
      <header className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground shadow-soft sm:h-20 sm:w-20 sm:text-2xl">
            J{index}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <input
                  defaultValue={meta?.headline ?? ""}
                  placeholder="Titre de la journée…"
                  className="w-full bg-transparent font-display text-2xl font-bold leading-tight outline-none placeholder:text-muted-foreground/50 sm:text-3xl"
                  onBlur={async (event) => {
                    if (event.target.value !== (meta?.headline ?? "")) {
                      try {
                        await upsertDay({ headline: event.target.value });
                      } catch (error: any) {
                        toast.error(error?.message ?? "Impossible d’enregistrer le titre.");
                      }
                    }
                  }}
                />
                <p className="mt-1 text-sm capitalize text-muted-foreground sm:text-base">{dateLabel}</p>
              </div>
              {noteCount > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                  <StickyNote className="h-3.5 w-3.5" /> Note · {noteCount}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <WeatherEditor
                icon={meta?.weather_icon}
                temperature={meta?.weather_temp}
                loading={weatherLoading}
                onSave={async (patch) => {
                  try {
                    await upsertDay(patch);
                  } catch (error: any) {
                    toast.error(error?.message ?? "Impossible d’enregistrer la météo.");
                  }
                }}
              />

              <select
                value={meta?.mood ?? ""}
                onChange={async (event) => {
                  try {
                    await upsertDay({ mood: event.target.value || null });
                  } catch (error: any) {
                    toast.error(error?.message ?? "Impossible d’enregistrer l’humeur.");
                  }
                }}
                className="h-11 rounded-full border border-border bg-background/70 px-4 text-sm font-medium outline-none transition focus:border-primary/50"
                aria-label="Humeur de la journée"
              >
                <option value="">😐 Humeur</option>
                {MOODS.map((mood) => (
                  <option key={mood.icon} value={mood.icon}>
                    {mood.icon} {mood.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {program.length > 0 && (
        <section className="mx-4 mb-4 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/45 p-5 sm:mx-6 sm:mb-6 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold">Programme du jour</h3>
              <p className="text-xs text-muted-foreground">Ton itinéraire, simplement.</p>
            </div>
          </div>

          <div className="space-y-0">
            {program.map((section, sectionIndex) => {
              const Icon = section.key === "morning" ? Sunrise : section.key === "afternoon" ? Sun : section.key === "evening" ? MoonStar : CalendarDays;
              return (
                <div
                  key={`${section.title}-${sectionIndex}`}
                  className={`grid grid-cols-[2.75rem_1fr] gap-3 py-4 ${sectionIndex > 0 ? "border-t border-border/60" : "pt-0"}`}
                >
                  <div className="flex justify-center pt-0.5 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-primary sm:text-lg">{section.title}</h4>
                    <ul className="mt-2 space-y-2.5 text-[15px] leading-6 text-foreground/90 sm:text-base">
                      {section.items.map((item, itemIndex) => (
                        <li key={`${section.title}-${itemIndex}`} className="flex gap-2.5">
                          <span className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {otherEntries.length > 0 && (
        <div className="mx-4 mb-4 grid gap-2 sm:mx-6 sm:mb-6 sm:grid-cols-2">
          {otherEntries.map((entry) => (
            <CompactEntry key={entry.id} entry={entry} tripId={tripId} />
          ))}
        </div>
      )}

      <div className="mx-4 mb-4 rounded-2xl border border-border/70 bg-background/35 sm:mx-6 sm:mb-6">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="mr-auto flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="tabular-nums text-lg font-bold">{daySpent.toFixed(2)} €</span>
            <span className="text-sm text-muted-foreground">
              · {expenses.length} dépense{expenses.length > 1 ? "s" : ""}
            </span>
          </span>
          <AddExpenseButton tripId={tripId} userId={userId} day={day} />
        </div>
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-6">
        <AddEntryButton tripId={tripId} userId={userId} day={day} />
      </div>

      {expenses.length > 0 && (
        <ul className="divide-y divide-border/60 border-t border-border/70 bg-background/20 px-2 sm:px-4">
          {expenses.map((expense) => {
            const Icon = expenseIcon(String(expense.label ?? ""));
            const forecast = expense.category === "Prévision IA+";
            return (
              <li key={expense.id} className="flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium sm:text-base">{expense.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{forecast ? "Prévision IA+" : expense.category || "Dépense"}</p>
                </div>
                <span className={`tabular-nums text-base font-bold ${forecast ? "text-primary" : "text-foreground"}`}>
                  {Number(expense.amount).toFixed(2)} €
                </span>
                {forecast ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      const { error } = await supabase.from("trip_expenses").delete().eq("id", expense.id);
                      if (error) toast.error(error.message);
                      else qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
                    }}
                    aria-label="Supprimer la dépense"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function WeatherEditor({
  icon,
  temperature,
  loading,
  onSave,
}: {
  icon?: string | null;
  temperature?: number | null;
  loading: boolean;
  onSave: (patch: Record<string, any>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draftIcon, setDraftIcon] = useState(icon ?? "⛅️");
  const [draftTemp, setDraftTemp] = useState(temperature == null ? "" : String(temperature));

  useEffect(() => {
    setDraftIcon(icon ?? "⛅️");
    setDraftTemp(temperature == null ? "" : String(temperature));
  }, [icon, temperature]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-background/70 px-4 text-sm font-medium transition hover:border-primary/40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="text-lg">{icon || "⛅️"}</span>}
          <span className="font-bold">{temperature == null ? "—" : `${Number(temperature).toFixed(0)}°`}</span>
          <span className="text-muted-foreground">· {weatherLabel(icon)}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Météo de la journée</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={draftIcon} onValueChange={setDraftIcon}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEATHER.map((weather) => (
                <SelectItem key={weather.icon} value={weather.icon}>
                  {weather.icon} {weather.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            step="0.5"
            placeholder="Température (°C)"
            value={draftTemp}
            onChange={(event) => setDraftTemp(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await onSave({ weather_icon: draftIcon, weather_temp: draftTemp ? Number(draftTemp) : null });
              setOpen(false);
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactEntry({ entry, tripId }: { entry: any; tripId: string }) {
  const qc = useQueryClient();
  const kind = ENTRY_KINDS.find((item) => item.value === entry.kind) ?? ENTRY_KINDS[0];
  const Icon = kind.icon;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/35 p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.title}</p>
        {(entry.city || entry.country) && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[entry.city, entry.country].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
      <button
        type="button"
        className="text-muted-foreground transition hover:text-destructive"
        onClick={async () => {
          const { error } = await supabase.from("trip_entries").delete().eq("id", entry.id);
          if (error) toast.error(error.message);
          else qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
        }}
        aria-label="Supprimer l’élément"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddExpenseButton({ tripId, userId, day }: { tripId: string; userId: string; day: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", amount: "", category: "" });
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!form.label.trim() || !form.amount) return;
    setPending(true);
    try {
      const { error } = await supabase.from("trip_expenses").insert({
        trip_id: tripId,
        user_id: userId,
        label: form.label.trim(),
        amount: Number(form.amount),
        category: form.category.trim() || null,
        spent_on: day,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] });
      setForm({ label: "", amount: "", category: "" });
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d’ajouter la dépense.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 rounded-full px-4">
          <Wallet className="mr-2 h-4 w-4" /> Dépense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle dépense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input placeholder="Montant (€)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input placeholder="Catégorie (restaurant, transport…)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <DialogFooter>
          <Button disabled={pending || !form.label.trim() || !form.amount} onClick={submit}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddEntryButton({ tripId, userId, day }: { tripId: string; userId: string; day: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ kind: "activity", title: "", city: "", country: "", notes: "" });

  const submit = async () => {
    if (!form.title.trim()) return;
    setPending(true);
    try {
      const { error } = await supabase.from("trip_entries").insert({
        trip_id: tripId,
        user_id: userId,
        kind: form.kind,
        title: form.title.trim(),
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        notes: form.notes.trim() || null,
        visited_on: day,
        position: 0,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
      setForm({ kind: "activity", title: "", city: "", country: "", notes: "" });
      setOpen(false);
      toast.success("Ajouté au journal");
    } catch (error: any) {
      toast.error(error?.message ?? "Impossible d’ajouter au journal.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-12 w-full rounded-2xl gradient-hero text-base font-semibold text-primary-foreground shadow-soft">
          <Plus className="mr-2 h-5 w-5" /> Ajouter au journal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter à cette journée</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTRY_KINDS.map((kind) => (
                <SelectItem key={kind.value} value={kind.value}>{kind.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Titre *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Ville" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Pays" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <Textarea rows={3} placeholder="Notes, ressenti, souvenirs…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <DialogFooter>
          <Button disabled={pending || !form.title.trim()} onClick={submit}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
