export type DayProgramSectionKey =
  "morning" | "lunch" | "afternoon" | "dinner" | "hotel" | "evening" | "other";

export type DayProgramSection = {
  key: DayProgramSectionKey;
  title: string;
  items: string[];
};

export type DayProgramSelection = {
  sectionKey: DayProgramSectionKey;
  optionLabel: string;
  text: string;
};

type JournalEntry = {
  id?: string;
  kind?: string | null;
  title?: string | null;
  notes?: string | null;
  visited_on?: string | null;
};

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

const PROGRAM_HEADING_RE =
  /^(Arrivée(?:\s*\/\s*Installation)?|Arrivee(?:\s*\/\s*Installation)?|Installation|Check-in|Départ(?:\s*\/\s*Transfert)?|Depart(?:\s*\/\s*Transfert)?|Transfert|Check-out|Matin|Petit-déjeuner|Petit dejeuner|Déjeuner|Dejeuner|Midi|Après-midi|Apres-midi|Fin d['’]après-midi|Fin d['’]apres-midi|Dîner|Diner|Repas du soir|Soir|Hôtel(?:\s*\/\s*Nuit)?|Hotel(?:\s*\/\s*Nuit)?|Hébergement(?:\s*\/\s*Nuit)?|Hebergement(?:\s*\/\s*Nuit)?|Nuit)(?:\s*[·–—-]\s*([^:]+))?(?:\s*:\s*(.*))?$/i;

export const JOURNAL_SELECTION_TITLE_PREFIX = "Carnet · Choix · ";

function cleanMarkdownLine(value: string) {
  return value
    .replace(/^\s*[-*•]+\s*/, "")
    .replace(/^\s*#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProgramTitle(value: string): DayProgramSectionKey {
  const text = normalizedText(value);
  if (text.includes("apres midi") || text.includes("fin d apres midi")) return "afternoon";
  if (text.includes("petit dejeuner") || text === "matin") return "morning";
  if (text.includes("dejeuner") || text === "midi") return "lunch";
  if (text.includes("diner") || text.includes("repas du soir")) return "dinner";
  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "hotel";
  if (text.includes("soir")) return "evening";
  if (text.includes("matin")) return "morning";
  return "other";
}

function prettyProgramTitle(value: string) {
  const text = normalizedText(value);
  if (text.includes("arrivee") || text.includes("installation") || text.includes("check in"))
    return "Arrivée / Installation";
  if (text.includes("depart") || text.includes("transfert") || text.includes("check out"))
    return "Départ / Transfert";
  if (text.includes("petit dejeuner")) return "Petit-déjeuner";
  if (text.includes("dejeuner") || text === "midi") return "Déjeuner";
  if (text.includes("apres midi") || text.includes("fin d apres midi")) return "Après-midi";
  if (text.includes("diner") || text.includes("repas du soir")) return "Dîner";
  if (text.includes("hotel") || text.includes("hebergement") || text.includes("nuit")) return "Hôtel / Nuit";
  if (text.includes("soir")) return "Soir";
  if (text.includes("matin")) return "Matin";
  return value.trim();
}

function isoDayFromHeading(line: string, fallbackYear: number) {
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const french = line
    .normalize("NFKC")
    .match(
      /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(20\d{2}))?\b/i,
    );
  if (!french) return null;
  const month = FRENCH_MONTHS[french[2].toLocaleLowerCase("fr-FR")];
  if (month == null) return null;
  const year = Number(french[3] || fallbackYear);
  const date = new Date(Date.UTC(year, month, Number(french[1])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function markdownHeadingText(line: string) {
  const direct = line.match(/^\s*#{1,6}\s+(.+)$/);
  if (direct) return direct[1];
  const malformed = line.match(/^\s*[-*•]+\s*#{1,6}\s+(.+)$/);
  return malformed?.[1] ?? null;
}

function hasDatedProgramHeadings(raw: string, targetDay: string) {
  const year = Number(targetDay.slice(0, 4)) || new Date().getUTCFullYear();
  return raw
    .replace(/\r/g, "")
    .split("\n")
    .some((line) => {
      const heading = markdownHeadingText(line);
      return !!heading && !!isoDayFromHeading(heading, year);
    });
}

export function extractDayProgramBlock(raw: string | null | undefined, targetDay: string) {
  if (!raw) return "";
  const lines = String(raw).replace(/\r/g, "").split("\n");
  const year = Number(targetDay.slice(0, 4)) || new Date().getUTCFullYear();
  const datedHeadings = lines.flatMap((line, index) => {
    const heading = markdownHeadingText(line);
    if (!heading) return [];
    const day = isoDayFromHeading(heading, year);
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

function isProgramNoise(value: string) {
  const text = normalizedText(value);
  return (
    !text ||
    /^recommandation ia\s*$/.test(text) ||
    /^note la recherche web/.test(text) ||
    /^la recherche web en direct n a pas retourne de source/.test(text) ||
    /^les informations ci dessous sont basees sur des donnees generales/.test(text) ||
    /^programme$/.test(text) ||
    /^plan d action$/.test(text) ||
    /^impact sur ton carnet$/.test(text) ||
    /^a verifier avant d agir$/.test(text)
  );
}

function isGenericFallback(title: string, item: string) {
  const heading = normalizedText(title);
  const text = normalizedText(item);
  if (heading.includes("arrivee") || heading.includes("installation")) {
    return text.startsWith("arrivee a destination transfert vers l hebergement") ||
      text.includes("installation selon ton heure d arrivee");
  }
  if (heading.includes("diner")) {
    return text.startsWith("repas a proximite de l hebergement") && text.includes("heure d arrivee");
  }
  if (heading.includes("hotel") || heading.includes("nuit")) {
    return text.startsWith("hebergement a confirmer pour cette nuit");
  }
  return false;
}

function mergeAndCleanSections(sections: DayProgramSection[]) {
  const merged = new Map<string, DayProgramSection>();
  for (const section of sections) {
    const mergeKey = section.key === "other" ? `other:${normalizedText(section.title)}` : section.key;
    const existing = merged.get(mergeKey);
    if (existing) existing.items.push(...section.items);
    else merged.set(mergeKey, { ...section, items: [...section.items] });
  }

  const seenItems = new Set<string>();
  return [...merged.values()]
    .map((section) => {
      const cleaned = section.items
        .map((item) => cleanMarkdownLine(item).replace(/^[:;,.\-–—]+\s*/, "").trim())
        .filter((item) => item && !isProgramNoise(item));
      const withoutFallbacks =
        cleaned.length > 1 ? cleaned.filter((item) => !isGenericFallback(section.title, item)) : cleaned;
      return {
        ...section,
        items: withoutFallbacks.filter((item) => {
          const signature = normalizedText(item);
          if (!signature || seenItems.has(signature)) return false;
          seenItems.add(signature);
          return true;
        }),
      };
    })
    .filter((section) => section.items.length > 0);
}

export function parseDayProgram(raw: string | null | undefined): DayProgramSection[] {
  if (!raw) return [];
  const relevant = raw
    .replace(/\r/g, "")
    .split(/\n\s*---\s*\n\s*##\s*(?:Budget|Impact sur ton carnet|À vérifier|A vérifier)/i)[0];
  const sections: DayProgramSection[] = [];
  let current: DayProgramSection | null = null;

  for (const original of relevant.split("\n")) {
    if (
      /^\s*#{1,6}\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources|Comparaison)/i.test(
        original,
      )
    )
      break;

    const isListItem = /^\s*[-*•]+\s+/.test(original);
    const malformedHeading = /^\s*[-*•]+\s*#{1,6}\s+/.test(original);
    const line = cleanMarkdownLine(original);
    if (!line) continue;
    const heading = !isListItem || malformedHeading ? line.match(PROGRAM_HEADING_RE) : null;

    if (heading) {
      const title = prettyProgramTitle(heading[1]);
      current = { key: normalizeProgramTitle(title), title, items: [] };
      sections.push(current);
      const tail = [heading[2], heading[3]]
        .filter(Boolean)
        .map((part) => cleanMarkdownLine(String(part)))
        .filter(Boolean)
        .join(" : ");
      if (tail) current.items.push(tail);
      continue;
    }

    if (!current) {
      const timed = line.match(/^(\d{1,2}(?::|h)\d{0,2})\s*[·:–—-]\s*(.+)$/i);
      if (!timed || isProgramNoise(line)) continue;
      current = { key: "other", title: "À faire", items: [`${timed[1]} · ${timed[2]}`] };
      sections.push(current);
      continue;
    }

    if (!isProgramNoise(line)) current.items.push(line);
  }

  return mergeAndCleanSections(sections);
}

export function dayProgramSignature(program: DayProgramSection[]) {
  return program
    .flatMap((section) => section.items)
    .map((item) => normalizedText(item))
    .filter(Boolean)
    .join("|");
}

export function isAiProgramEntry(entry: JournalEntry) {
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

export function isJournalSelectionEntry(entry: JournalEntry) {
  return (
    entry?.kind === "note" && String(entry?.title ?? "").startsWith(JOURNAL_SELECTION_TITLE_PREFIX)
  );
}

export function isInternalJournalEntry(entry: JournalEntry) {
  return isAiProgramEntry(entry) || isJournalSelectionEntry(entry);
}

function entryKey(entry: JournalEntry) {
  if (entry.id) return `id:${entry.id}`;
  return [entry.visited_on ?? "", entry.title ?? "", entry.notes ?? ""].join("|");
}

function programFromEntryForDay(entry: JournalEntry, day: string, allowUndated: boolean) {
  if (!isAiProgramEntry(entry) || !entry.notes) return [];
  const raw = String(entry.notes);
  if (!allowUndated && !hasDatedProgramHeadings(raw, day)) return [];
  return parseDayProgram(extractDayProgramBlock(raw, day));
}

export function buildDayProgramForDate(args: {
  day: string;
  entries: JournalEntry[];
  allEntries: JournalEntry[];
}) {
  const direct = args.entries
    .filter((entry) => isAiProgramEntry(entry) && !!entry.notes)
    .sort((left, right) => {
      const leftExact = /^IA\+\s*·\s*Jour/i.test(String(left.title ?? "")) ? 1 : 0;
      const rightExact = /^IA\+\s*·\s*Jour/i.test(String(right.title ?? "")) ? 1 : 0;
      return rightExact - leftExact;
    });

  const seen = new Set(direct.map(entryKey));
  const sameDayFallback = args.allEntries.filter(
    (entry) => entry.visited_on === args.day && !seen.has(entryKey(entry)),
  );

  for (const entry of [...direct, ...sameDayFallback]) {
    const program = programFromEntryForDay(entry, args.day, true);
    if (program.length > 0) return program;
    seen.add(entryKey(entry));
  }

  for (const entry of args.allEntries) {
    if (seen.has(entryKey(entry))) continue;
    const program = programFromEntryForDay(entry, args.day, false);
    if (program.length > 0) return program;
  }

  return [];
}

export function parseProgramOption(item: string) {
  const match = item.match(/^(Option(?:en)?s?\s+([A-Z])|Choix\s+(\d+))\s*(?:[·:–—-]\s*)?(.*)$/i);
  if (!match) return null;
  const label = match[2] ? `Option ${match[2].toUpperCase()}` : `Choix ${match[3]}`;
  return { label, text: (match[4] || item).trim() };
}

export function journalSelectionsFromEntries(entries: JournalEntry[]) {
  const result: Partial<Record<DayProgramSectionKey, DayProgramSelection>> = {};
  for (const entry of entries) {
    if (!isJournalSelectionEntry(entry) || !entry.notes) continue;
    try {
      const parsed = JSON.parse(entry.notes) as DayProgramSelection;
      if (!parsed?.sectionKey || !parsed?.optionLabel || !parsed?.text) continue;
      result[parsed.sectionKey] = parsed;
    } catch {
      continue;
    }
  }
  return result;
}

export function applyProgramSelections(
  program: DayProgramSection[],
  selections: Partial<Record<DayProgramSectionKey, DayProgramSelection>>,
) {
  return program.map((section) => {
    const selected = selections[section.key];
    if (!selected) return section;
    const nonOptions = section.items.filter((item) => !parseProgramOption(item));
    return {
      ...section,
      items: [...nonOptions, `${selected.optionLabel} · ${selected.text}`],
    };
  });
}
