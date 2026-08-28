import fs from "node:fs";

function update(path, transform) {
  const file = new URL(`../${path}`, import.meta.url);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(`[Trip journal V2] ${path}: corrigé`);
  } else {
    console.log(`[Trip journal V2] ${path}: déjà conforme`);
  }
}

function mustReplace(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[Trip journal V2] Bloc introuvable: ${label}`);
  return source.replace(search, replacement);
}

update("src/components/TripDaySectionPremium.tsx", (source) => {
  if (source.includes("TRIP_JOURNAL_DAYS_V2")) return source;

  source = mustReplace(
    source,
    'import { useQuery, useQueryClient } from "@tanstack/react-query";',
    'import { useQuery, useQueryClient } from "@tanstack/react-query";\nimport { useServerFn } from "@tanstack/react-start";',
    "useServerFn import",
  );
  source = mustReplace(
    source,
    'import { supabase } from "@/integrations/supabase/client";',
    'import { supabase } from "@/integrations/supabase/client";\nimport { refreshTripDayWeather } from "@/lib/trip-weather.functions";\n// TRIP_JOURNAL_DAYS_V2',
    "weather function import",
  );
  source = mustReplace(
    source,
    '  entries: any[];\n  expenses: any[];',
    '  entries: any[];\n  allEntries?: any[];\n  expenses: any[];',
    "all entries prop",
  );
  source = mustReplace(
    source,
    '  return value\n    .replace(/^\\s*[-*•]+\\s*/, "")',
    '  return value\n    .replace(/^\\s*#{1,6}\\s*/, "")\n    .replace(/^\\s*[-*•]+\\s*/, "")',
    "markdown heading cleanup",
  );

  const parseMarker = 'function parseProgram(raw: string | null | undefined): ProgramSection[] {';
  const helpers = String.raw`
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

`;
  if (!source.includes("function extractProgramForDay")) {
    if (!source.includes(parseMarker)) throw new Error("[Trip journal V2] parseProgram introuvable");
    source = source.replace(parseMarker, `${helpers}${parseMarker}`);
  }

  source = source.replace(
    /const heading = line\.match\(\n\s*\/\^\(Matin\|Après-midi\|Apres-midi\|Midi\|Soir\|Fin d\['’\]après-midi\|Fin d\['’\]apres-midi\)\\s\*:\\s\*\(\.\*\)\$\/i,\n\s*\);/,
    `const heading = line.match(\n      /^(Matin|Après-midi|Apres-midi|Midi|Soir|Fin d['’]après-midi|Fin d['’]apres-midi)(?:\\s*[\\/·–—-]\\s*([^:]+))?(?:\\s*:\\s*(.*))?$/i,\n    );`,
  );
  source = mustReplace(
    source,
    '      const tail = cleanMarkdownLine(heading[2]);\n      if (tail) current.items.push(tail);',
    '      const tail = [heading[2], heading[3]].filter(Boolean).map((part) => cleanMarkdownLine(part)).filter(Boolean).join(" : ");\n      if (tail) current.items.push(tail);',
    "program heading tail",
  );

  source = mustReplace(
    source,
    'export function TripDaySectionPremium({ index, day, tripId, userId, meta, entries, expenses }: Props) {\n  const qc = useQueryClient();',
    'export function TripDaySectionPremium({ index, day, tripId, userId, meta, entries, allEntries = entries, expenses }: Props) {\n  const qc = useQueryClient();\n  const weatherFn = useServerFn(refreshTripDayWeather);',
    "component signature",
  );

  const oldProgramBlock = `  const aiNote = useMemo(\n    () =>\n      entries.find(\n        (entry) =>\n          entry.kind === "note" &&\n          (/^IA\\+\\s*·\\s*Jour/i.test(String(entry.title ?? "")) || /\\*\\*Matin/i.test(String(entry.notes ?? ""))),\n      ),\n    [entries],\n  );\n  const program = useMemo(() => parseProgram(aiNote?.notes), [aiNote?.notes]);\n  const otherEntries = useMemo(() => entries.filter((entry) => entry.id !== aiNote?.id), [entries, aiNote?.id]);\n  const noteCount = entries.filter((entry) => entry.kind === "note").length + (meta?.notes ? 1 : 0);`;
  const newProgramBlock = `  const programSource = useMemo(() => {\n    const exact = entries.find(\n      (entry) => entry.kind === "note" && /^IA\\+\\s*·\\s*Jour/i.test(String(entry.title ?? "")),\n    );\n    if (exact?.notes) return String(exact.notes);\n    const legacy = allEntries.find((entry) => {\n      if (!isAiProgramNote(entry) || !entry?.notes) return false;\n      return !!extractProgramForDay(String(entry.notes), day);\n    });\n    return legacy?.notes ? String(legacy.notes) : "";\n  }, [entries, allEntries, day]);\n  const program = useMemo(\n    () => parseProgram(extractProgramForDay(programSource, day)),\n    [programSource, day],\n  );\n  const otherEntries = useMemo(\n    () => entries.filter((entry) => !isAiProgramNote(entry)),\n    [entries],\n  );\n  const noteCount = entries.filter((entry) => entry.kind === "note" && !isAiProgramNote(entry)).length + (meta?.notes ? 1 : 0);`;
  source = mustReplace(source, oldProgramBlock, newProgramBlock, "day-specific IA program");

  const weatherEffect = /  useEffect\(\(\) => \{\n    if \(\(meta\?\.weather_icon && meta\?\.weather_temp != null\) \|\| weatherLoading\) return;[\s\S]*?  \}, \[day, tripId, meta\?\.weather_icon, meta\?\.weather_temp\]\);/;
  if (!weatherEffect.test(source)) throw new Error("[Trip journal V2] ancien chargement météo introuvable");
  source = source.replace(
    weatherEffect,
    `  useEffect(() => {\n    if ((meta?.weather_icon && meta?.weather_temp != null) || weatherLoading) return;\n    let cancelled = false;\n\n    const loadWeather = async () => {\n      setWeatherLoading(true);\n      try {\n        await weatherFn({ data: { tripId, day } });\n        if (!cancelled) await qc.invalidateQueries({ queryKey: ["trip-days", tripId] });\n      } catch (error) {\n        console.warn("[GlobeLink météo]", error);\n      } finally {\n        if (!cancelled) setWeatherLoading(false);\n      }\n    };\n\n    void loadWeather();\n    return () => {\n      cancelled = true;\n    };\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [day, tripId, meta?.weather_icon, meta?.weather_temp]);`,
  );

  source = source
    .replace('className="space-y-0">\n            {program.map', 'className="grid gap-3">\n            {program.map')
    .replace(
      'className={`grid grid-cols-[2.75rem_1fr] gap-3 py-4 ${sectionIndex > 0 ? "border-t border-border/60" : "pt-0"}`}',
      'className="grid grid-cols-[2.5rem_1fr] gap-3 rounded-2xl border border-border/60 bg-card/55 p-3.5 sm:p-4"',
    )
    .replace('className="text-base font-bold text-primary sm:text-lg"', 'className="text-[15px] font-bold text-primary sm:text-base"')
    .replace('className="mt-2 space-y-2.5 text-[15px] leading-6 text-foreground/90 sm:text-base"', 'className="mt-2 space-y-2 text-sm leading-6 text-foreground/90"')
    .replace(
      'className="flex gap-2.5">\n                          <span className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />\n                          <span>{item}</span>',
      'className="rounded-xl bg-background/55 px-3 py-2.5">\n                          <span>{item}</span>',
    );

  const weatherButtonOld = `{loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="text-lg">{icon || "⛅️"}</span>}\n          <span className="font-bold">{temperature == null ? "—" : \`${'${Number(temperature).toFixed(0)}'}°\`}</span>\n          <span className="text-muted-foreground">· {weatherLabel(icon)}</span>`;
  const weatherButtonNew = `{loading ? (\n            <>\n              <Loader2 className="h-4 w-4 animate-spin text-primary" />\n              <span className="font-semibold">Météo…</span>\n            </>\n          ) : temperature != null && icon ? (\n            <>\n              <span className="text-lg">{icon}</span>\n              <span className="font-bold">{Number(temperature).toFixed(0)}°</span>\n              <span className="text-muted-foreground">· {weatherLabel(icon)}</span>\n            </>\n          ) : (\n            <>\n              <CloudSun className="h-4 w-4 text-primary" />\n              <span className="font-semibold">Météo à charger</span>\n            </>\n          )}`;
  source = mustReplace(source, weatherButtonOld, weatherButtonNew, "weather empty state");

  return source;
});

update("src/routes/_authenticated.trips.$id.tsx", (source) => {
  if (source.includes("allEntries={entries ?? []}")) return source;
  return mustReplace(
    source,
    '                  entries={(entries ?? []).filter((entry) => entry.visited_on === date)}\n                  expenses={(expenses ?? []).filter((expense) => expense.spent_on === date)}',
    '                  entries={(entries ?? []).filter((entry) => entry.visited_on === date)}\n                  allEntries={entries ?? []}\n                  expenses={(expenses ?? []).filter((expense) => expense.spent_on === date)}',
    "all entries route prop",
  );
});

update("src/lib/ai-pro.functions.ts", (source) => {
  if (source.includes("AI_DAY_SPLIT_V2")) return source;

  source = mustReplace(
    source,
    '      plan:\n        "Agis comme un travel planner. Construis ou réorganise un plan concret, réaliste, jour par jour si pertinent, en tenant compte du carnet connecté, du budget restant et des déplacements.",',
    '      plan:\n        "Agis comme un travel planner. Construis ou réorganise un plan concret et réaliste, strictement séparé par journée. Pour chaque date du séjour, commence obligatoirement par un titre de forme ### YYYY-MM-DD · titre court, puis utilise les sous-titres ### Matin, ### Après-midi et ### Soir si pertinents. Ne mélange jamais le contenu de deux dates dans le même bloc. Tiens compte du carnet connecté, du budget restant et des déplacements.",',
    "plan prompt",
  );

  const helperMarker = 'export const saveAiPlusRecommendation = createServerFn({ method: "POST" })';
  const helpers = String.raw`
// AI_DAY_SPLIT_V2
const AI_FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, décembre: 11,
};

function addIsoDays(day: string, amount: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function aiHeadingDay(line: string, startsOn?: string | null) {
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const jour = line.match(/\bJ(?:our)?\s*(\d{1,2})\b/i);
  if (jour && startsOn) return addIsoDays(startsOn, Math.max(0, Number(jour[1]) - 1));
  const year = Number(startsOn?.slice(0, 4)) || new Date().getUTCFullYear();
  const french = line.normalize("NFKC").match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(20\d{2}))?\b/i);
  if (!french) return null;
  const month = AI_FRENCH_MONTHS[french[2].toLocaleLowerCase("fr-FR")];
  if (month == null) return null;
  return new Date(Date.UTC(Number(french[3] || year), month, Number(french[1]))).toISOString().slice(0, 10);
}

function splitAiItineraryByDay(content: string, startsOn?: string | null, endsOn?: string | null) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const result: Array<{ day: string; notes: string }> = [];
  let current: { day: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const notes = current.lines.join("\n").trim();
    if (notes) result.push({ day: current.day, notes: notes.slice(0, 4_000) });
  };

  for (const line of lines) {
    if (/^\s*#{2,6}\s+/.test(line)) {
      const day = aiHeadingDay(line, startsOn);
      if (day) {
        flush();
        current = { day, lines: [] };
        continue;
      }
      if (current && /^\s*##\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources)/i.test(line)) {
        flush();
        current = null;
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  flush();

  const seen = new Set<string>();
  return result.filter((item) => {
    if (startsOn && item.day < startsOn) return false;
    if (endsOn && item.day > endsOn) return false;
    if (seen.has(item.day)) return false;
    seen.add(item.day);
    return true;
  });
}

`;
  if (!source.includes(helperMarker)) throw new Error("[Trip journal V2] save IA+ marker introuvable");
  source = source.replace(helperMarker, `${helpers}${helperMarker}`);

  source = mustReplace(
    source,
    '.select("id, title, starts_on, notes")',
    '.select("id, title, starts_on, ends_on, notes")',
    "trip end date for IA save",
  );

  const oldInsert = `    if (trip.starts_on) {\n      await db.from("trip_entries").insert({\n        trip_id: trip.id,\n        user_id: context.userId,\n        kind: "note",\n        title: \`IA+ · \${data.title}\`,\n        notes: data.content.slice(0, 4_000),\n        visited_on: trip.starts_on,\n        position: -10,\n      });\n    }`;
  const newInsert = `    const itineraryDays = splitAiItineraryByDay(data.content, trip.starts_on, trip.ends_on);\n    if (itineraryDays.length > 0) {\n      await db\n        .from("trip_entries")\n        .delete()\n        .eq("trip_id", trip.id)\n        .eq("user_id", context.userId)\n        .eq("kind", "note")\n        .like("title", "IA+ · Jour%");\n\n      await db.from("trip_days").upsert(\n        itineraryDays.map((item) => ({\n          trip_id: trip.id,\n          user_id: context.userId,\n          day_date: item.day,\n        })),\n        { onConflict: "trip_id,day_date" },\n      );\n\n      await db.from("trip_entries").insert(\n        itineraryDays.map((item, index) => ({\n          trip_id: trip.id,\n          user_id: context.userId,\n          kind: "note",\n          title: \`IA+ · Jour \${index + 1}\`,\n          notes: item.notes,\n          visited_on: item.day,\n          position: -100 + index,\n        })),\n      );\n    }`;
  source = mustReplace(source, oldInsert, newInsert, "split saved itinerary");

  return source;
});
