from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f"Missing patch target: {label}")
    return source.replace(old, new, 1)

component_path = Path("src/components/TripDaySectionPremium.tsx")
component = component_path.read_text()
component = replace_once(
    component,
    'import { refreshTripDayWeather } from "@/lib/trip-weather.functions";\n',
    'import { refreshTripDayWeather } from "@/lib/trip-weather.functions";\nimport { setTripProgramSelection } from "@/lib/trip-program-selection.functions";\n',
    "component server selection import",
)
component = replace_once(
    component,
    '  if (/restauration|restaurant|repas/i.test(cleaned)) return "Restauration";\n',
    '  if (/hébergement|hebergement|hôtel|hotel|nuit|logement/i.test(cleaned)) return "Hébergement";\n  if (/restauration|restaurant|repas/i.test(cleaned)) return "Restauration";\n',
    "budget accommodation category",
)
component = replace_once(
    component,
    '''function parseForecastBreakdown(
  notes: string | null | undefined,
  day: string,
  dayIndex: number,
  total: number,
): ForecastBreakdown {
  const safeTotal = Math.max(0, Number(total || 0));
''',
    '''function parseForecastBreakdown(
  notes: string | null | undefined,
  day: string,
  dayIndex: number,
  total: number,
  storedDetails?: any,
): ForecastBreakdown {
  const safeTotal = Math.max(0, Number(total || 0));
  const storedItems = Array.isArray(storedDetails?.items)
    ? storedDetails.items
        .map((item: any) => ({
          label: normalizeBudgetCategory(String(item?.category ?? item?.label ?? "Autres")),
          amount: Math.max(0, Number(item?.amount || 0)),
        }))
        .filter((item: ForecastBreakdownItem) => Number.isFinite(item.amount) && item.amount >= 0)
    : [];
  if (storedItems.length > 0) {
    return {
      items: storedItems,
      note: "Budget IA+ synchronisé avec les choix enregistrés dans ce programme.",
    };
  }
''',
    "stored forecast details",
)
component = replace_once(
    component,
    '  const weatherFn = useServerFn(refreshTripDayWeather);\n  const [weatherLoading, setWeatherLoading] = useState(false);\n',
    '  const weatherFn = useServerFn(refreshTripDayWeather);\n  const setProgramSelectionFn = useServerFn(setTripProgramSelection);\n  const [weatherLoading, setWeatherLoading] = useState(false);\n',
    "selection server fn hook",
)
selection_start = component.find('  const saveProgramSelection = async (\n')
selection_end = component.find('  const noteCount = entries.filter', selection_start)
if selection_start < 0 or selection_end < 0:
    raise RuntimeError("Missing program selection functions block")
selection_block = '''  const saveProgramSelection = async (
    sectionKey: DayProgramSectionKey,
    optionLabel: string,
  ) => {
    await setProgramSelectionFn({
      data: { tripId, day, sectionKey, optionLabel, action: "select" },
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["trip-entries", tripId] }),
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] }),
      qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    ]);
    toast.success("Programme et budget IA+ mis à jour");
  };

  const clearProgramSelection = async (sectionKey: DayProgramSectionKey) => {
    await setProgramSelectionFn({
      data: { tripId, day, sectionKey, action: "clear" },
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["trip-entries", tripId] }),
      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] }),
      qc.invalidateQueries({ queryKey: ["trip", tripId] }),
    ]);
    toast.success("Choix retiré et budget IA+ recalculé");
  };

'''
component = component[:selection_start] + selection_block + component[selection_end:]
component = replace_once(
    component,
    '                                      await saveProgramSelection(section.key, parsedOption.label, parsedOption.text);\n',
    '                                      await saveProgramSelection(section.key, parsedOption.label);\n',
    "option selection call",
)
component = replace_once(
    component,
    '''  const breakdown = parseForecastBreakdown(
    tripNotes,
    day,
    dayIndex,
    Number(expense.amount || 0),
  );
''',
    '''  const breakdown = parseForecastBreakdown(
    tripNotes,
    day,
    dayIndex,
    Number(expense.amount || 0),
    expense.details,
  );
''',
    "forecast detail call",
)
component_path.write_text(component)

ai_path = Path("src/lib/ai-pro.functions.ts")
ai = ai_path.read_text()
ai = replace_once(
    ai,
    'import { generateTravelAiText } from "./ai-gateway.server";\n',
    'import { generateTravelAiText } from "./ai-gateway.server";\nimport { JOURNAL_SELECTION_TITLE_PREFIX, parseDayProgram, parseProgramOption } from "@/features/travel/day-program";\nimport { buildProgramBudgetSelection, recalculateForecastFromSelections } from "@/features/travel/program-selection-budget";\n',
    "ai program imports",
)
ai = replace_once(
    ai,
    'Pour un budget, détaille chaque journée puis termine par un résumé avec total, marge et budget conseillé. Garde les paragraphes courts et privilégie les listes lisibles sur mobile. // AI_READABLE_OUTPUT_V1',
    'Pour un budget, détaille chaque journée puis termine par un résumé avec total, marge et budget conseillé. Pour chaque option sélectionnable de restaurant, hôtel ou activité, indique un prix estimatif exploitable au format « env. X € / pers. », « env. X € / nuit » ou « env. X € total » quand tu disposes d’une base raisonnable ; sinon écris explicitement « prix à confirmer » sans inventer. Le tableau Budget doit rester cohérent avec les options du programme et servir de base au recalcul quand l’utilisateur change un choix dans son carnet. Garde les paragraphes courts et privilégie les listes lisibles sur mobile. // AI_READABLE_OUTPUT_V1',
    "ai pricing prompt",
)
block_start = ai.find('    const itineraryDays = splitAiPlusProgramByDay(data.content, trip.starts_on, trip.ends_on);')
block_end_marker = '''    return {
      saved: true,
      tripId: String(trip.id),
      appliedDays: itineraryDays.length,
      appliedBudgetDays: budgetForecasts.length,
      totalForecast: budgetForecasts.reduce((sum, forecast) => sum + forecast.total, 0),
    };'''
block_end = ai.find(block_end_marker, block_start)
if block_start < 0 or block_end < 0:
    raise RuntimeError("Missing IA+ apply block")
new_apply_block = '''    const itineraryDays = splitAiPlusProgramByDay(data.content, trip.starts_on, trip.ends_on);
    const programByDay = new Map<string, ReturnType<typeof parseDayProgram>>();

    for (const item of itineraryDays) {
      const parsedProgram = parseDayProgram(item.notes);
      programByDay.set(item.day, parsedProgram);

      const { data: selectionRows } = await db
        .from("trip_entries")
        .select("id, notes")
        .eq("trip_id", trip.id)
        .eq("user_id", context.userId)
        .eq("visited_on", item.day)
        .like("title", `${JOURNAL_SELECTION_TITLE_PREFIX}%`);

      for (const row of selectionRows ?? []) {
        let keep = false;
        try {
          const stored = JSON.parse(String(row.notes ?? "{}"));
          const section = parsedProgram.find((candidate) => candidate.key === stored?.sectionKey);
          const options = (section?.items ?? []).flatMap((value) => {
            const option = parseProgramOption(value);
            return option ? [option] : [];
          });
          keep = options.some(
            (option) =>
              option.label.toLowerCase() === String(stored?.optionLabel ?? "").toLowerCase() &&
              option.text.normalize("NFKC") === String(stored?.text ?? "").normalize("NFKC"),
          );
        } catch {
          keep = false;
        }
        if (!keep) {
          await db.from("trip_entries").delete().eq("id", row.id).eq("user_id", context.userId);
        }
      }

      const { error: deleteProgramError } = await db
        .from("trip_entries")
        .delete()
        .eq("trip_id", trip.id)
        .eq("user_id", context.userId)
        .eq("visited_on", item.day)
        .eq("kind", "note")
        .like("title", "IA+ · Jour%");
      if (deleteProgramError) throw new Error("Impossible de remplacer le programme IA+ de cette journée.");

      await db.from("trip_days").upsert(
        { trip_id: trip.id, user_id: context.userId, day_date: item.day },
        { onConflict: "trip_id,day_date" },
      );

      const startMs = trip.starts_on ? Date.parse(`${trip.starts_on}T12:00:00Z`) : Number.NaN;
      const dayMs = Date.parse(`${item.day}T12:00:00Z`);
      const dayNumber = Number.isFinite(startMs) && Number.isFinite(dayMs)
        ? Math.max(1, Math.round((dayMs - startMs) / 86_400_000) + 1)
        : itineraryDays.indexOf(item) + 1;
      const { error: insertProgramError } = await db.from("trip_entries").insert({
        trip_id: trip.id,
        user_id: context.userId,
        kind: "note",
        title: `IA+ · Jour ${dayNumber}`,
        notes: item.notes,
        visited_on: item.day,
        position: -100 + dayNumber - 1,
      });
      if (insertProgramError) throw new Error("Impossible d'enregistrer le programme IA+ de cette journée.");
    }

    const budgetForecasts = parseAiPlusBudgetForecasts(data.content, trip.starts_on, trip.ends_on);
    let appliedForecastTotal = 0;
    for (const forecast of budgetForecasts) {
      let dayProgram = programByDay.get(forecast.day);
      if (!dayProgram) {
        const { data: storedProgram } = await db
          .from("trip_entries")
          .select("notes")
          .eq("trip_id", trip.id)
          .eq("user_id", context.userId)
          .eq("visited_on", forecast.day)
          .eq("kind", "note")
          .like("title", "IA+ · Jour%")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        dayProgram = parseDayProgram(String(storedProgram?.notes ?? ""));
      }

      const { data: selectionRows } = await db
        .from("trip_entries")
        .select("notes")
        .eq("trip_id", trip.id)
        .eq("user_id", context.userId)
        .eq("visited_on", forecast.day)
        .like("title", `${JOURNAL_SELECTION_TITLE_PREFIX}%`);
      const selections = (selectionRows ?? []).flatMap((row) => {
        try {
          const stored = JSON.parse(String(row.notes ?? "{}"));
          const section = dayProgram?.find((candidate) => candidate.key === stored?.sectionKey);
          const options = (section?.items ?? []).flatMap((value) => {
            const option = parseProgramOption(value);
            return option ? [option] : [];
          });
          const selected = options.find(
            (option) => option.label.toLowerCase() === String(stored?.optionLabel ?? "").toLowerCase(),
          );
          if (!selected) return [];
          return [
            buildProgramBudgetSelection({
              sectionKey: stored.sectionKey,
              optionLabel: selected.label,
              text: selected.text,
              baseOptionText: options[0]?.text ?? null,
            }),
          ];
        } catch {
          return [];
        }
      });
      const recalculated = recalculateForecastFromSelections(forecast.items, selections);

      const { error: deleteForecastError } = await db
        .from("trip_expenses")
        .delete()
        .eq("trip_id", trip.id)
        .eq("user_id", context.userId)
        .eq("spent_on", forecast.day)
        .eq("category", "Prévision IA+");
      if (deleteForecastError) throw new Error("Impossible de remplacer la prévision IA+ de cette journée.");

      const { error: insertForecastError } = await db.from("trip_expenses").insert({
        trip_id: trip.id,
        user_id: context.userId,
        label: `IA+ · Budget prévu · ${forecast.day}`,
        amount: recalculated.total,
        category: "Prévision IA+",
        spent_on: forecast.day,
        details: {
          source: "ia_plus",
          baseItems: forecast.items,
          items: recalculated.items,
          selections: recalculated.selections,
          updatedAt: new Date().toISOString(),
        },
      });
      if (insertForecastError) throw new Error("Impossible d'appliquer le budget IA+ au carnet.");
      appliedForecastTotal += recalculated.total;
    }

    return {
      saved: true,
      tripId: String(trip.id),
      appliedDays: itineraryDays.length,
      appliedBudgetDays: budgetForecasts.length,
      totalForecast: Math.round(appliedForecastTotal * 100) / 100,
    };'''
ai = ai[:block_start] + new_apply_block + ai[block_end + len(block_end_marker):]
ai_path.write_text(ai)

package_path = Path("package.json")
pkg = package_path.read_text()
pkg = replace_once(
    pkg,
    '"check:phase6": "node scripts/phase6-journal-validate.mjs && vitest run src/features/travel/day-program.test.ts"',
    '"check:phase6": "node scripts/phase6-journal-validate.mjs && vitest run src/features/travel/day-program.test.ts src/features/travel/program-selection-budget.test.ts"',
    "phase6 selection budget tests",
)
package_path.write_text(pkg)
print("IA+ program/budget synchronization patches applied.")
