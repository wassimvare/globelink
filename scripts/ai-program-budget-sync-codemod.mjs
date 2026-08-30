import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(search, replacement);
}

const componentPath = "src/components/TripDaySectionPremium.tsx";
let component = fs.readFileSync(componentPath, "utf8");

component = replaceOnce(
  component,
  'import { refreshTripDayWeather } from "@/lib/trip-weather.functions";\n',
  'import { refreshTripDayWeather } from "@/lib/trip-weather.functions";\nimport { setTripProgramSelection } from "@/lib/trip-program-selection.functions";\n',
  "component server selection import",
);

component = replaceOnce(
  component,
  '  if (/restauration|restaurant|repas/i.test(cleaned)) return "Restauration";\n',
  '  if (/hébergement|hebergement|hôtel|hotel|nuit|logement/i.test(cleaned)) return "Hébergement";\n  if (/restauration|restaurant|repas/i.test(cleaned)) return "Restauration";\n',
  "budget accommodation category",
);

component = replaceOnce(
  component,
  'function parseForecastBreakdown(\n  notes: string | null | undefined,\n  day: string,\n  dayIndex: number,\n  total: number,\n): ForecastBreakdown {\n  const safeTotal = Math.max(0, Number(total || 0));\n',
  'function parseForecastBreakdown(\n  notes: string | null | undefined,\n  day: string,\n  dayIndex: number,\n  total: number,\n  storedDetails?: any,\n): ForecastBreakdown {\n  const safeTotal = Math.max(0, Number(total || 0));\n  const storedItems = Array.isArray(storedDetails?.items)\n    ? storedDetails.items\n        .map((item: any) => ({\n          label: normalizeBudgetCategory(String(item?.category ?? item?.label ?? "Autres")),\n          amount: Math.max(0, Number(item?.amount || 0)),\n        }))\n        .filter((item: ForecastBreakdownItem) => Number.isFinite(item.amount) && item.amount >= 0)\n    : [];\n  if (storedItems.length > 0) {\n    return {\n      items: storedItems,\n      note: "Budget IA+ synchronisé avec les choix enregistrés dans ce programme.",\n    };\n  }\n',
  "stored forecast details",
);

component = replaceOnce(
  component,
  '  const weatherFn = useServerFn(refreshTripDayWeather);\n  const [weatherLoading, setWeatherLoading] = useState(false);\n',
  '  const weatherFn = useServerFn(refreshTripDayWeather);\n  const setProgramSelectionFn = useServerFn(setTripProgramSelection);\n  const [weatherLoading, setWeatherLoading] = useState(false);\n',
  "selection server fn hook",
);

const selectionStart = component.indexOf('  const saveProgramSelection = async (\n');
const selectionEnd = component.indexOf('  const noteCount = entries.filter', selectionStart);
if (selectionStart < 0 || selectionEnd < 0) throw new Error("Missing program selection functions block");
component = `${component.slice(0, selectionStart)}  const saveProgramSelection = async (\n    sectionKey: DayProgramSectionKey,\n    optionLabel: string,\n  ) => {\n    await setProgramSelectionFn({\n      data: { tripId, day, sectionKey, optionLabel, action: "select" },\n    });\n    await Promise.all([\n      qc.invalidateQueries({ queryKey: ["trip-entries", tripId] }),\n      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] }),\n      qc.invalidateQueries({ queryKey: ["trip", tripId] }),\n    ]);\n    toast.success("Programme et budget IA+ mis à jour");\n  };\n\n  const clearProgramSelection = async (sectionKey: DayProgramSectionKey) => {\n    await setProgramSelectionFn({\n      data: { tripId, day, sectionKey, action: "clear" },\n    });\n    await Promise.all([\n      qc.invalidateQueries({ queryKey: ["trip-entries", tripId] }),\n      qc.invalidateQueries({ queryKey: ["trip-expenses", tripId] }),\n      qc.invalidateQueries({ queryKey: ["trip", tripId] }),\n    ]);\n    toast.success("Choix retiré et budget IA+ recalculé");\n  };\n\n${component.slice(selectionEnd)}`;

component = replaceOnce(
  component,
  '                                      await saveProgramSelection(section.key, parsedOption.label, parsedOption.text);\n',
  '                                      await saveProgramSelection(section.key, parsedOption.label);\n',
  "option selection call",
);

component = replaceOnce(
  component,
  '  const breakdown = parseForecastBreakdown(\n    tripNotes,\n    day,\n    dayIndex,\n    Number(expense.amount || 0),\n  );\n',
  '  const breakdown = parseForecastBreakdown(\n    tripNotes,\n    day,\n    dayIndex,\n    Number(expense.amount || 0),\n    expense.details,\n  );\n',
  "forecast detail call",
);

fs.writeFileSync(componentPath, component);

const aiPath = "src/lib/ai-pro.functions.ts";
let ai = fs.readFileSync(aiPath, "utf8");

ai = replaceOnce(
  ai,
  'import { generateTravelAiText } from "./ai-gateway.server";\n',
  'import { generateTravelAiText } from "./ai-gateway.server";\nimport { JOURNAL_SELECTION_TITLE_PREFIX, parseDayProgram, parseProgramOption } from "@/features/travel/day-program";\nimport { buildProgramBudgetSelection, recalculateForecastFromSelections } from "@/features/travel/program-selection-budget";\n',
  "ai program imports",
);

ai = replaceOnce(
  ai,
  'Pour un budget, détaille chaque journée puis termine par un résumé avec total, marge et budget conseillé. Garde les paragraphes courts et privilégie les listes lisibles sur mobile. // AI_READABLE_OUTPUT_V1',
  'Pour un budget, détaille chaque journée puis termine par un résumé avec total, marge et budget conseillé. Pour chaque option sélectionnable de restaurant, hôtel ou activité, indique un prix estimatif exploitable au format « env. X € / pers. », « env. X € / nuit » ou « env. X € total » quand tu disposes d’une base raisonnable ; sinon écris explicitement « prix à confirmer » sans inventer. Le tableau Budget doit rester cohérent avec les options du programme et servir de base au recalcul quand l’utilisateur change un choix dans son carnet. Garde les paragraphes courts et privilégie les listes lisibles sur mobile. // AI_READABLE_OUTPUT_V1',
  "ai pricing prompt",
);

const blockStart = ai.indexOf('    const itineraryDays = splitAiPlusProgramByDay(data.content, trip.starts_on, trip.ends_on);');
const blockEndMarker = '    return {\n      saved: true,\n      tripId: String(trip.id),\n      appliedDays: itineraryDays.length,\n      appliedBudgetDays: budgetForecasts.length,\n      totalForecast: budgetForecasts.reduce((sum, forecast) => sum + forecast.total, 0),\n    };';
const blockEnd = ai.indexOf(blockEndMarker, blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error("Missing IA+ apply block");
const newApplyBlock = `    const itineraryDays = splitAiPlusProgramByDay(data.content, trip.starts_on, trip.ends_on);\n    const programByDay = new Map<string, ReturnType<typeof parseDayProgram>>();\n\n    for (const item of itineraryDays) {\n      const parsedProgram = parseDayProgram(item.notes);\n      programByDay.set(item.day, parsedProgram);\n\n      const { data: selectionRows } = await db\n        .from("trip_entries")\n        .select("id, notes")\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("visited_on", item.day)\n        .like("title", \\`${JOURNAL_SELECTION_TITLE_PREFIX}%\\`);\n\n      for (const row of selectionRows ?? []) {\n        let keep = false;\n        try {\n          const stored = JSON.parse(String(row.notes ?? "{}"));\n          const section = parsedProgram.find((candidate) => candidate.key === stored?.sectionKey);\n          const options = (section?.items ?? []).flatMap((value) => {\n            const option = parseProgramOption(value);\n            return option ? [option] : [];\n          });\n          keep = options.some(\n            (option) =>\n              option.label.toLowerCase() === String(stored?.optionLabel ?? "").toLowerCase() &&\n              option.text.normalize("NFKC") === String(stored?.text ?? "").normalize("NFKC"),\n          );\n        } catch {\n          keep = false;\n        }\n        if (!keep) {\n          await db.from("trip_entries").delete().eq("id", row.id).eq("user_id", context.userId);\n        }\n      }\n\n      const { error: deleteProgramError } = await db\n        .from("trip_entries")\n        .delete()\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("visited_on", item.day)\n        .eq("kind", "note")\n        .like("title", "IA+ · Jour%");\n      if (deleteProgramError) throw new Error("Impossible de remplacer le programme IA+ de cette journée.");\n\n      await db.from("trip_days").upsert(\n        { trip_id: trip.id, user_id: context.userId, day_date: item.day },\n        { onConflict: "trip_id,day_date" },\n      );\n\n      const startMs = trip.starts_on ? Date.parse(\\`${trip.starts_on}T12:00:00Z\\`) : Number.NaN;\n      const dayMs = Date.parse(\\`${item.day}T12:00:00Z\\`);\n      const dayNumber = Number.isFinite(startMs) && Number.isFinite(dayMs)\n        ? Math.max(1, Math.round((dayMs - startMs) / 86_400_000) + 1)\n        : itineraryDays.indexOf(item) + 1;\n      const { error: insertProgramError } = await db.from("trip_entries").insert({\n        trip_id: trip.id,\n        user_id: context.userId,\n        kind: "note",\n        title: \\`IA+ · Jour ${dayNumber}\\`,\n        notes: item.notes,\n        visited_on: item.day,\n        position: -100 + dayNumber - 1,\n      });\n      if (insertProgramError) throw new Error("Impossible d'enregistrer le programme IA+ de cette journée.");\n    }\n\n    const budgetForecasts = parseAiPlusBudgetForecasts(data.content, trip.starts_on, trip.ends_on);\n    let appliedForecastTotal = 0;\n    for (const forecast of budgetForecasts) {\n      let dayProgram = programByDay.get(forecast.day);\n      if (!dayProgram) {\n        const { data: storedProgram } = await db\n          .from("trip_entries")\n          .select("notes")\n          .eq("trip_id", trip.id)\n          .eq("user_id", context.userId)\n          .eq("visited_on", forecast.day)\n          .eq("kind", "note")\n          .like("title", "IA+ · Jour%")\n          .order("updated_at", { ascending: false })\n          .limit(1)\n          .maybeSingle();\n        dayProgram = parseDayProgram(String(storedProgram?.notes ?? ""));\n      }\n\n      const { data: selectionRows } = await db\n        .from("trip_entries")\n        .select("notes")\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("visited_on", forecast.day)\n        .like("title", \\`${JOURNAL_SELECTION_TITLE_PREFIX}%\\`);\n      const selections = (selectionRows ?? []).flatMap((row) => {\n        try {\n          const stored = JSON.parse(String(row.notes ?? "{}"));\n          const section = dayProgram?.find((candidate) => candidate.key === stored?.sectionKey);\n          const options = (section?.items ?? []).flatMap((value) => {\n            const option = parseProgramOption(value);\n            return option ? [option] : [];\n          });\n          const selected = options.find(\n            (option) => option.label.toLowerCase() === String(stored?.optionLabel ?? "").toLowerCase(),\n          );\n          if (!selected) return [];\n          return [\n            buildProgramBudgetSelection({\n              sectionKey: stored.sectionKey,\n              optionLabel: selected.label,\n              text: selected.text,\n              baseOptionText: options[0]?.text ?? null,\n            }),\n          ];\n        } catch {\n          return [];\n        }\n      });\n      const recalculated = recalculateForecastFromSelections(forecast.items, selections);\n\n      const { error: deleteForecastError } = await db\n        .from("trip_expenses")\n        .delete()\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("spent_on", forecast.day)\n        .eq("category", "Prévision IA+");\n      if (deleteForecastError) throw new Error("Impossible de remplacer la prévision IA+ de cette journée.");\n\n      const { error: insertForecastError } = await db.from("trip_expenses").insert({\n        trip_id: trip.id,\n        user_id: context.userId,\n        label: \\`IA+ · Budget prévu · ${forecast.day}\\`,\n        amount: recalculated.total,\n        category: "Prévision IA+",\n        spent_on: forecast.day,\n        details: {\n          source: "ia_plus",\n          baseItems: forecast.items,\n          items: recalculated.items,\n          selections: recalculated.selections,\n          updatedAt: new Date().toISOString(),\n        },\n      });\n      if (insertForecastError) throw new Error("Impossible d'appliquer le budget IA+ au carnet.");\n      appliedForecastTotal += recalculated.total;\n    }\n\n    return {\n      saved: true,\n      tripId: String(trip.id),\n      appliedDays: itineraryDays.length,\n      appliedBudgetDays: budgetForecasts.length,\n      totalForecast: Math.round(appliedForecastTotal * 100) / 100,\n    };`;
ai = `${ai.slice(0, blockStart)}${newApplyBlock}${ai.slice(blockEnd + blockEndMarker.length)}`;
fs.writeFileSync(aiPath, ai);

const packagePath = "package.json";
let pkg = fs.readFileSync(packagePath, "utf8");
pkg = replaceOnce(
  pkg,
  '"check:phase6": "node scripts/phase6-journal-validate.mjs && vitest run src/features/travel/day-program.test.ts"',
  '"check:phase6": "node scripts/phase6-journal-validate.mjs && vitest run src/features/travel/day-program.test.ts src/features/travel/program-selection-budget.test.ts"',
  "phase6 selection budget tests",
);
fs.writeFileSync(packagePath, pkg);

console.log("IA+ program/budget synchronization patches applied.");
