import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  JOURNAL_SELECTION_TITLE_PREFIX,
  parseDayProgram,
  parseProgramOption,
  type DayProgramSectionKey,
} from "@/features/travel/day-program";
import {
  buildProgramBudgetSelection,
  recalculateForecastFromSelections,
  type ProgramBudgetItem,
  type ProgramBudgetSelection,
} from "@/features/travel/program-selection-budget";

const SECTION_KEYS = new Set<DayProgramSectionKey>([
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "hotel",
  "evening",
  "other",
]);

function clean(value: unknown, max = 500) {
  return String(value ?? "").normalize("NFKC").trim().slice(0, max);
}

function asIsoDay(value: unknown) {
  const day = clean(value, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(day)) throw new Error("Journée invalide.");
  return day;
}

async function loadProgram(db: any, tripId: string, userId: string, day: string) {
  const { data, error } = await db
    .from("trip_entries")
    .select("id, notes, updated_at")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .eq("visited_on", day)
    .eq("kind", "note")
    .like("title", "IA+ · Jour%")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return parseDayProgram(String(data?.notes ?? ""));
}

function hydrateSelection(
  raw: any,
  program: ReturnType<typeof parseDayProgram>,
): ProgramBudgetSelection | null {
  const sectionKey = raw?.sectionKey as DayProgramSectionKey;
  if (!SECTION_KEYS.has(sectionKey)) return null;
  const section = program.find((candidate) => candidate.key === sectionKey);
  const options = (section?.items ?? []).flatMap((item) => {
    const option = parseProgramOption(item);
    return option ? [option] : [];
  });
  const selected = options.find((option) => option.label.toLowerCase() === String(raw?.optionLabel ?? "").toLowerCase());
  const canonicalText = selected?.text || clean(raw?.text, 900);
  if (!canonicalText) return null;
  const baseOption = options[0];
  return {
    ...buildProgramBudgetSelection({
      sectionKey,
      optionLabel: selected?.label || clean(raw?.optionLabel, 40) || "Choix",
      text: canonicalText,
      baseOptionText: baseOption?.text ?? raw?.baseOptionText ?? null,
    }),
  };
}

async function readSelections(
  db: any,
  tripId: string,
  userId: string,
  day: string,
  program: ReturnType<typeof parseDayProgram>,
) {
  const { data, error } = await db
    .from("trip_entries")
    .select("notes")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .eq("visited_on", day)
    .like("title", `${JOURNAL_SELECTION_TITLE_PREFIX}%`);
  if (error) throw error;
  return (data ?? []).flatMap((row: any) => {
    try {
      const hydrated = hydrateSelection(JSON.parse(String(row.notes ?? "{}")), program);
      return hydrated ? [hydrated] : [];
    } catch {
      return [];
    }
  });
}

async function recalculateDayForecast(
  db: any,
  tripId: string,
  userId: string,
  day: string,
  program: ReturnType<typeof parseDayProgram>,
) {
  const { data: forecast, error } = await db
    .from("trip_expenses")
    .select("id, amount, details")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .eq("spent_on", day)
    .eq("category", "Prévision IA+")
    .maybeSingle();
  if (error) throw error;
  if (!forecast?.id) return null;

  const details = forecast.details && typeof forecast.details === "object" ? forecast.details : {};
  const baseItems = Array.isArray((details as any).baseItems)
    ? ((details as any).baseItems as ProgramBudgetItem[])
    : Array.isArray((details as any).items)
      ? ((details as any).items as ProgramBudgetItem[])
      : [];
  if (!baseItems.length) return { total: Number(forecast.amount || 0), items: [] };

  const selections = await readSelections(db, tripId, userId, day, program);
  const recalculated = recalculateForecastFromSelections(baseItems, selections);
  const { error: updateError } = await db
    .from("trip_expenses")
    .update({
      amount: recalculated.total,
      details: {
        ...(details as Record<string, unknown>),
        baseItems,
        items: recalculated.items,
        selections: recalculated.selections,
        updatedAt: new Date().toISOString(),
      },
    })
    .eq("id", forecast.id)
    .eq("user_id", userId);
  if (updateError) throw updateError;
  return recalculated;
}

export const setTripProgramSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const value = input as Record<string, unknown>;
    const tripId = clean(value.tripId, 80);
    const day = asIsoDay(value.day);
    const sectionKey = clean(value.sectionKey, 30) as DayProgramSectionKey;
    const action = value.action === "clear" ? "clear" : "select";
    const optionLabel = clean(value.optionLabel, 40);
    if (!tripId || !SECTION_KEYS.has(sectionKey)) throw new Error("Choix de programme invalide.");
    if (action === "select" && !optionLabel) throw new Error("Option invalide.");
    return { tripId, day, sectionKey, action, optionLabel };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: trip, error: tripError } = await db
      .from("trips")
      .select("id, starts_on, ends_on")
      .eq("id", data.tripId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (tripError || !trip?.id) throw new Error("Voyage introuvable.");
    if ((trip.starts_on && data.day < trip.starts_on) || (trip.ends_on && data.day > trip.ends_on)) {
      throw new Error("Cette journée ne fait pas partie du voyage.");
    }

    const program = await loadProgram(db, trip.id, context.userId, data.day);
    if (!program.length) throw new Error("Le programme IA+ de cette journée est introuvable.");
    const title = `${JOURNAL_SELECTION_TITLE_PREFIX}${data.sectionKey}`;

    const { error: deleteError } = await db
      .from("trip_entries")
      .delete()
      .eq("trip_id", trip.id)
      .eq("user_id", context.userId)
      .eq("visited_on", data.day)
      .eq("title", title);
    if (deleteError) throw deleteError;

    let selection: ProgramBudgetSelection | null = null;
    if (data.action === "select") {
      const section = program.find((candidate) => candidate.key === data.sectionKey);
      const options = (section?.items ?? []).flatMap((item) => {
        const option = parseProgramOption(item);
        return option ? [option] : [];
      });
      const selected = options.find(
        (option) => option.label.toLowerCase() === data.optionLabel.toLowerCase(),
      );
      if (!selected) throw new Error("Cette option n'existe plus dans le programme IA+.");
      selection = buildProgramBudgetSelection({
        sectionKey: data.sectionKey,
        optionLabel: selected.label,
        text: selected.text,
        baseOptionText: options[0]?.text ?? null,
      });
      const { error: insertError } = await db.from("trip_entries").insert({
        trip_id: trip.id,
        user_id: context.userId,
        kind: "note",
        title,
        notes: JSON.stringify(selection),
        visited_on: data.day,
        position: Math.floor(Date.now() % 2_000_000_000),
      });
      if (insertError) throw insertError;
    }

    const forecast = await recalculateDayForecast(
      db,
      trip.id,
      context.userId,
      data.day,
      program,
    );

    return {
      saved: true,
      selection,
      forecastTotal: forecast?.total ?? null,
      forecastItems: forecast?.items ?? [],
    };
  });
