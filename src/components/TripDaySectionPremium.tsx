import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  applyProgramSelections,
  buildDayProgramForDate,
  isInternalJournalEntry,
  journalSelectionsFromEntries,
  JOURNAL_SELECTION_TITLE_PREFIX,
  parseProgramOption,
  type DayProgramSectionKey,
} from "@/features/travel/day-program";
import { refreshTripDayWeather } from "@/lib/trip-weather.functions";
// TRIP_JOURNAL_DAYS_V2
// TRIP_DAILY_PROGRAM_V3
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
  allEntries?: any[];
  expenses: any[];
};

type ProgramSection = {
  key: "morning" | "lunch" | "afternoon" | "dinner" | "hotel" | "evening" | "other";
  title: string;
  items: string[];
};

type ForecastBreakdownItem = {
  label: string;
  amount: number;
};

type ForecastBreakdown = {
  items: ForecastBreakdownItem[];
  note: string;
};

function normalizeProgramTitle(value: string): ProgramSection["key"] {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.includes("apres-midi") || text.includes("fin d'apres-midi")) return "afternoon";
  if (text.includes("petit-dejeuner") || text.includes("petit dejeuner") || text === "matin") return "morning";
  if (text.includes("dejeuner") || text === "midi") return "lunch";
  if (text.includes("diner") || text.includes("repas du soir")) return "dinner";
  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "hotel";
  if (text.includes("soir")) return "evening";
  if (text.includes("matin")) return "morning";
  return "other";
}

function cleanMarkdownLine(value: string) {
  return value
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/^\s*[-*•]+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

function isoDayFromHeading(line: string, fallbackYear: number) {
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const french = line
    .normalize("NFKC")
    .match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(20\d{2}))?\b/i);
  if (!french) return null;
  const month = FRENCH_MONTHS[french[2].toLocaleLowerCase("fr-FR")];
  if (month == null) return null;
  const year = Number(french[3] || fallbackYear);
  const date = new Date(Date.UTC(year, month, Number(french[1])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function extractProgramForDay(raw: string | null | undefined, targetDay: string) {
  if (!raw) return "";
  const lines = String(raw).replace(/\r/g, "").split("\n");
  const year = Number(targetDay.slice(0, 4)) || new Date().getUTCFullYear();
  const datedHeadings = lines.flatMap((line, index) => {
    if (!/^\s*#{1,6}\s+/.test(line)) return [];
    const day = isoDayFromHeading(line, year);
    return day ? [{ index, day }] : [];
  });

  if (!datedHeadings.length) return raw;
  const currentIndex = datedHeadings.findIndex((item) => item.day === targetDay);
  if (currentIndex < 0) return "";
  const start = datedHeadings[currentIndex].index + 1;
  const next = datedHeadings[currentIndex + 1]?.index ?? lines.length;
  const selected = lines.slice(start, next);
  const majorCut = selected.findIndex((line) =>
    /^\s*##\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources)/i.test(line),
  );
  return (majorCut >= 0 ? selected.slice(0, majorCut) : selected).join("\n").trim();
}

function isAiProgramNote(entry: any) {
  if (entry?.kind !== "note") return false;
  const title = String(entry?.title ?? "");
  const notes = String(entry?.notes ?? "");
  return (
    /^IA\+\s*·/i.test(title) ||
    /##\s*Recommandation IA\+/i.test(notes) ||
    /###\s*(?:20\d{2}-\d{2}-\d{2}|(?:Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\b)/i.test(notes) ||
    /\*\*(?:Matin|Après-midi|Apres-midi|Soir)/i.test(notes)
  );
}


function prettyProgramTitle(value: string) {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (text.includes("petit-dejeuner") || text.includes("petit dejeuner")) return "Petit-déjeuner";
  if (text.includes("dejeuner") || text === "midi") return "Déjeuner";
  if (text.includes("apres-midi") || text.includes("fin d'apres-midi")) return "Après-midi";
  if (text.includes("diner") || text.includes("repas du soir")) return "Dîner";
  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "Hôtel / Nuit";
  if (text.includes("soir")) return "Soir";
  if (text.includes("matin")) return "Matin";
  return value.trim();
}

function isProgramNoise(value: string) {
  const text = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return (
    !text ||
    /^recommandation ia\+\s*:?$/.test(text) ||
    /^note\s*:\s*la recherche web/.test(text) ||
    /^la recherche web en direct n['’]a pas retourne de source/.test(text) ||
    /^les informations ci-dessous sont basees sur des donnees generales/.test(text) ||
    /^programme\s*:?$/.test(text) ||
    /^plan d['’]action\s*:?$/.test(text) ||
    /^impact sur ton carnet\s*:?$/.test(text) ||
    /^a verifier avant d['’]agir\s*:?$/.test(text)
  );
}

function programSignature(program: ProgramSection[]) {
  return program
    .flatMap((section) => section.items)
    .map((item) => item.normalize("NFKC").toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, " ").trim())
    .filter(Boolean)
    .join("|");
}

function parseProgram(raw: string | null | undefined): ProgramSection[] {
  if (!raw) return [];
  const relevant = raw
    .replace(/\r/g, "")
    .split(/\n\s*---\s*\n\s*##\s*(?:Budget|Impact sur ton carnet|À vérifier|A vérifier)/i)[0];

  const sections: ProgramSection[] = [];
  let current: ProgramSection | null = null;

  for (const original of relevant.split("\n")) {
    if (/^\s*#{1,6}\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources|Comparaison)/i.test(original)) break;
    const line = cleanMarkdownLine(original);
    if (!line) continue;

    const heading = line.match(
      /^(Matin|Petit-déjeuner|Petit dejeuner|Déjeuner|Dejeuner|Midi|Après-midi|Apres-midi|Fin d['’]après-midi|Fin d['’]apres-midi|Dîner|Diner|Repas du soir|Soir|Hôtel|Hotel|Hébergement|Hebergement|Nuit)(?:\s*[\/·–—-]\s*([^:]+))?(?:\s*:\s*(.*))?$/i,
    );
    if (heading) {
      const title = prettyProgramTitle(heading[1]);
      current = { key: normalizeProgramTitle(title), title, items: [] };
      sections.push(current);
      const tail = [heading[2], heading[3]].filter(Boolean).map((part) => cleanMarkdownLine(part)).filter(Boolean).join(" : ");
      if (tail) current.items.push(tail);
      continue;
    }

    if (!current) {
      const timed = line.match(/^(\d{1,2}(?::|h)\d{0,2})\s*[·:–—-]\s*(.+)$/i);
      if (!timed || isProgramNoise(line)) continue;
      current = { key: "other", title: "À faire", items: [] };
      sections.push(current);
      current.items.push(`${timed[1]} · ${timed[2]}`);
      continue;
    }
    if (!isProgramNoise(line)) current.items.push(line);
  }

  const seenItems = new Set<string>();
  return sections
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => item.replace(/^[:;,.\-–—]+\s*/, "").trim())
        .filter((item) => {
          if (!item || isProgramNoise(item)) return false;
          const signature = item
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[^a-z0-9à-ÿ]+/gi, " ")
            .trim();
          if (!signature || seenItems.has(signature)) return false;
          seenItems.add(signature);
          return true;
        }),
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

function forecastTitle(label: string) {
  return label
    .replace(/^IA\+\s*·\s*/i, "")
    .replace(/^Budget prévu\s*·\s*/i, "")
    .trim() || "Prévision IA+";
}

function normalizeBudgetCategory(value: string) {
  const cleaned = cleanMarkdownLine(value)
    .replace(/[.:;–—-]+$/g, "")
    .trim();
  if (/restauration|restaurant|repas/i.test(cleaned)) return "Restauration";
  if (/transport|trajet|déplacement/i.test(cleaned)) return "Transports";
  if (/activité|activite|extra|divers|achat|shopping|souvenir/i.test(cleaned)) {
    return "Activités & extras";
  }
  return cleaned || "Autres";
}

function parseForecastBreakdown(
  notes: string | null | undefined,
  day: string,
  dayIndex: number,
  total: number,
): ForecastBreakdown {
  const safeTotal = Math.max(0, Number(total || 0));
  const raw = String(notes ?? "").replace(/\r/g, "");
  const latestBlock = raw.split(/\n\n---\n## ✨ IA\+\s*·\s*/).at(-1) ?? raw;
  const [, month = "", date = ""] = day.split("-");
  const ddmm = `${date}/${month}`;
  const dayTokens = [day, ddmm, `jour ${dayIndex}`].map((token) => token.toLowerCase());

  const explicitItems: ForecastBreakdownItem[] = [];
  for (const line of latestBlock.split("\n")) {
    if (!line.includes("|") || !line.includes("€")) continue;
    const plain = line.replace(/\*\*/g, "").replace(/`/g, "").trim();
    const lower = plain.toLowerCase();
    if (!dayTokens.some((token) => lower.includes(token))) continue;
    if (/\btotal\b/i.test(plain)) continue;
    if (!/(restauration|restaurant|repas|transport|activité|activite|extra|divers|achat|shopping|souvenir)/i.test(plain)) continue;

    const cells = plain.split("|").map((cell) => cell.trim()).filter(Boolean);
    const categoryCell = cells.find((cell) =>
      /(restauration|restaurant|repas|transport|activité|activite|extra|divers|achat|shopping|souvenir)/i.test(cell),
    );
    const amountCell = cells.find((cell) => /[0-9]+(?:[.,][0-9]{1,2})?\s*€/.test(cell));
    const amountMatch = amountCell?.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s*€/);
    if (!categoryCell || !amountMatch) continue;
    const amount = Number(amountMatch[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    explicitItems.push({ label: normalizeBudgetCategory(categoryCell), amount });
  }

  const explicitSum = explicitItems.reduce((sum, item) => sum + item.amount, 0);
  if (explicitItems.length > 0 && Math.abs(explicitSum - safeTotal) < 0.011) {
    return {
      items: explicitItems,
      note: "Ventilation détaillée fournie directement par IA+ pour cette journée.",
    };
  }

  const allocationLine = raw
    .split("\n")
    .filter(
      (line) =>
        /allocation\s+prévisionnelle|allocation\s+previsionnelle/i.test(line) &&
        line.includes("€") &&
        line.includes("/"),
    )
    .at(-1);

  if (allocationLine) {
    const weights: Array<{ label: string; weight: number }> = [];
    const cleanLine = allocationLine.replace(/\*\*/g, "").replace(/`/g, "");
    const pattern = /([0-9]+(?:[.,][0-9]{1,2})?)\s*€\s*([^/|\n]+)/g;
    for (const match of cleanLine.matchAll(pattern)) {
      const weight = Number(match[1].replace(",", "."));
      const label = normalizeBudgetCategory(match[2]);
      if (!Number.isFinite(weight) || weight <= 0 || /total|budget/i.test(label)) continue;
      weights.push({ label, weight });
    }

    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    if (weights.length >= 2 && totalWeight > 0 && safeTotal > 0) {
      const totalCents = Math.round(safeTotal * 100);
      let remainingCents = totalCents;
      const items = weights.map((item, itemIndex) => {
        const cents =
          itemIndex === weights.length - 1
            ? remainingCents
            : Math.min(
                remainingCents,
                Math.max(0, Math.round((totalCents * item.weight) / totalWeight)),
              );
        remainingCents -= cents;
        return { label: item.label, amount: cents / 100 };
      });
      return {
        items,
        note: "Répartition estimée à partir de l’allocation IA+ enregistrée pour ce voyage.",
      };
    }
  }

  return {
    items: [{ label: "Budget non ventilé", amount: safeTotal }],
    note: "IA+ n’a pas encore détaillé ce total par poste de dépense.",
  };
}

export function TripDaySectionPremium({ index, day, tripId, userId, meta, entries, allEntries = entries, expenses }: Props) {
  const qc = useQueryClient();
  const weatherFn = useServerFn(refreshTripDayWeather);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const actualExpenses = useMemo(
    () => expenses.filter((expense) => expense.category !== "Prévision IA+"),
    [expenses],
  );
  const forecastExpenses = useMemo(
    () => expenses.filter((expense) => expense.category === "Prévision IA+"),
    [expenses],
  );
  const daySpent = actualExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const dayForecast = forecastExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const rawProgram = useMemo(
    () => buildDayProgramForDate({ day, entries, allEntries }),
    [day, entries, allEntries],
  );
  const selections = useMemo(() => journalSelectionsFromEntries(entries), [entries]);
  const program = useMemo(
    () => applyProgramSelections(rawProgram, selections),
    [rawProgram, selections],
  );
  const otherEntries = useMemo(
    () => entries.filter((entry) => !isInternalJournalEntry(entry)),
    [entries],
  );

  const saveProgramSelection = async (
    sectionKey: DayProgramSectionKey,
    optionLabel: string,
    text: string,
  ) => {
    const title = `${JOURNAL_SELECTION_TITLE_PREFIX}${sectionKey}`;
    const { error: deleteError } = await supabase
      .from("trip_entries")
      .delete()
      .eq("trip_id", tripId)
      .eq("visited_on", day)
      .eq("title", title);
    if (deleteError) throw deleteError;
    const { error } = await supabase.from("trip_entries").insert({
      trip_id: tripId,
      user_id: userId,
      kind: "note",
      title,
      notes: JSON.stringify({ sectionKey, optionLabel, text }),
      visited_on: day,
      position: Math.floor(Date.now() % 2_000_000_000),
    });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
    toast.success("Choix enregistré dans cette journée");
  };

  const clearProgramSelection = async (sectionKey: DayProgramSectionKey) => {
    const title = `${JOURNAL_SELECTION_TITLE_PREFIX}${sectionKey}`;
    const { error } = await supabase
      .from("trip_entries")
      .delete()
      .eq("trip_id", tripId)
      .eq("visited_on", day)
      .eq("title", title);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["trip-entries", tripId] });
  };

  const noteCount = entries.filter((entry) => entry.kind === "note" && !isInternalJournalEntry(entry)).length + (meta?.notes ? 1 : 0);

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
        await weatherFn({ data: { tripId, day } });
        if (!cancelled) await qc.invalidateQueries({ queryKey: ["trip-days", tripId] });
      } catch (error) {
        console.warn("[GlobeLink météo]", error);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    void loadWeather();
    return () => {
      cancelled = true;
    };
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
        <section data-testid="day-program" data-day={day} className="mx-4 mb-4 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/45 p-5 sm:mx-6 sm:mb-6 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold">Programme du jour</h3>
              <p className="text-xs text-muted-foreground">Un planning clair, uniquement pour cette journée.</p>
            </div>
          </div>

          <div className="grid gap-3">
            {program.map((section, sectionIndex) => {
              const selectedOption = selections[section.key];
              const sourceSection = rawProgram.find((candidate) => candidate.key === section.key);
              const hasOptions = !!sourceSection?.items.some((item) => !!parseProgramOption(item));
              const Icon =
                section.key === "morning"
                  ? Sunrise
                  : section.key === "lunch" || section.key === "dinner"
                    ? UtensilsCrossed
                    : section.key === "hotel"
                      ? Bed
                      : section.key === "afternoon"
                        ? Sun
                        : section.key === "evening"
                          ? MoonStar
                          : CalendarDays;
              return (
                <div
                  key={`${section.title}-${sectionIndex}`}
                  className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl border border-border/60 bg-card/55 p-3.5 sm:p-4"
                >
                  <div className="flex justify-center pt-0.5 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-[15px] font-bold text-primary sm:text-base">{section.title}</h4>
                      {selectedOption && hasOptions && (
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                          onClick={async () => {
                            try {
                              await clearProgramSelection(section.key);
                            } catch (error: any) {
                              toast.error(error?.message ?? "Impossible de modifier ce choix.");
                            }
                          }}
                        >
                          Changer
                        </button>
                      )}
                    </div>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-foreground/90">
                      {section.items.map((item, itemIndex) => {
                        const option = item.match(/^(Option\s+[A-C]|Choix\s+\d+)\s*(?:[·:–—-]\s*)?(.*)$/i);
                        return (
                          <li
                            key={`${section.title}-${itemIndex}`}
                            className="rounded-xl border border-border/40 bg-background/60 px-3 py-2.5"
                          >
                            {option ? (
                              selectedOption ? (
                                <div className="flex items-start gap-2.5">
                                  <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                                    Choisi
                                  </span>
                                  <span className="min-w-0">{option[2] || item}</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  data-testid="day-program-option"
                                  className="flex w-full items-start gap-2.5 text-left"
                                  onClick={async () => {
                                    const parsedOption = parseProgramOption(item);
                                    if (!parsedOption) return;
                                    try {
                                      await saveProgramSelection(section.key, parsedOption.label, parsedOption.text);
                                    } catch (error: any) {
                                      toast.error(error?.message ?? "Impossible d’enregistrer ce choix.");
                                    }
                                  }}
                                >
                                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                                    {option[1]}
                                  </span>
                                  <span className="min-w-0 flex-1">{option[2] || item}</span>
                                  <span className="shrink-0 text-[11px] font-semibold text-primary">Choisir</span>
                                </button>
                              )
                            ) : (
                              <span>{item}</span>
                            )}
                          </li>
                        );
                      })}
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
          <span className="mr-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="tabular-nums text-lg font-bold">{daySpent.toFixed(2)} €</span>
            <span className="text-sm text-muted-foreground">
              dépensé · {actualExpenses.length} dépense{actualExpenses.length > 1 ? "s" : ""}
            </span>
            {dayForecast > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {dayForecast.toFixed(2)} € prévu IA+
              </span>
            )}
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
            const forecast = expense.category === "Prévision IA+";
            if (forecast) {
              return (
                <ForecastExpenseRow
                  key={expense.id}
                  expense={expense}
                  day={day}
                  dayIndex={index}
                  tripId={tripId}
                />
              );
            }

            const Icon = expenseIcon(String(expense.label ?? ""));
            return (
              <li key={expense.id} className="flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium sm:text-base">{expense.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{expense.category || "Dépense"}</p>
                </div>
                <span className="tabular-nums text-base font-bold text-foreground">
                  {Number(expense.amount).toFixed(2)} €
                </span>
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
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

function ForecastExpenseRow({
  expense,
  day,
  dayIndex,
  tripId,
}: {
  expense: any;
  day: string;
  dayIndex: number;
  tripId: string;
}) {
  const Icon = expenseIcon(String(expense.label ?? ""));
  const title = forecastTitle(String(expense.label ?? ""));
  const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const { data: tripNotes = "", isLoading: breakdownLoading } = useQuery({
    queryKey: ["trip-ai-plus-budget-notes", tripId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("notes")
        .eq("id", tripId)
        .maybeSingle();
      if (error) throw error;
      return String(data?.notes ?? "");
    },
    staleTime: 5 * 60 * 1000,
  });
  const breakdown = parseForecastBreakdown(
    tripNotes,
    day,
    dayIndex,
    Number(expense.amount || 0),
  );

  return (
    <li>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-3"
            aria-label={`Voir le détail des dépenses prévues IA+ de ${Number(expense.amount).toFixed(2)} euros`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium sm:text-base">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Prévision IA+ · Voir les dépenses</p>
            </div>
            <span className="tabular-nums text-base font-bold text-primary">
              {Number(expense.amount).toFixed(2)} €
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Détail des dépenses prévues IA+</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Total prévu</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground/90">{title}</p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">{dateLabel}</p>
                </div>
                <p className="shrink-0 tabular-nums text-3xl font-bold text-primary">
                  {Number(expense.amount).toFixed(2)} €
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 font-semibold">
                <Wallet className="h-4 w-4 text-primary" /> Répartition des dépenses
              </div>

              {breakdownLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Calcul du détail…
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {breakdown.items.map((item, itemIndex) => {
                    const DetailIcon = expenseIcon(item.label);
                    return (
                      <div
                        key={`${item.label}-${itemIndex}`}
                        className="flex items-center gap-3 px-4 py-3.5"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <DetailIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium sm:text-base">
                          {item.label}
                        </span>
                        <span className="tabular-nums text-sm font-bold sm:text-base">
                          {item.amount.toFixed(2)} €
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border/80 bg-background/40 px-4 py-3.5">
                <span className="font-semibold">Total</span>
                <span className="tabular-nums text-lg font-bold text-primary">
                  {Number(expense.amount).toFixed(2)} €
                </span>
              </div>
            </div>

            {!breakdownLoading && (
              <p className="text-xs leading-relaxed text-muted-foreground">{breakdown.note}</p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Ces montants sont des prévisions IA+ et ne sont pas comptés comme des dépenses réelles tant que tu ne les ajoutes pas toi-même au carnet.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </li>
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
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-semibold">Météo…</span>
            </>
          ) : temperature != null && icon ? (
            <>
              <span className="text-lg">{icon}</span>
              <span className="font-bold">{Number(temperature).toFixed(0)}°</span>
              <span className="text-muted-foreground">· {weatherLabel(icon)}</span>
            </>
          ) : (
            <>
              <CloudSun className="h-4 w-4 text-primary" />
              <span className="font-semibold">Météo à charger</span>
            </>
          )}
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
