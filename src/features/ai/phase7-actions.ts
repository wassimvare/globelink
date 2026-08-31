import {
  enrichAiPlusPricePlaceholders,
  type TravelPriceEstimateContext,
} from "@/lib/travel-price-estimates";

export type AiPlusDayPlan = { day: string; headline: string | null; notes: string };
export type AiPlusBudgetForecast = {
  day: string;
  total: number;
  items: Array<{ category: string; amount: number; detail: string }>;
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

const FRENCH_MONTH_PATTERN =
  "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";

function addIsoDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function dayFromAiHeading(line: string, startsOn?: string | null) {
  const iso = line.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const jour = line.match(/\bJ(?:our)?\s*(\d{1,2})\b/i);
  if (jour && startsOn) return addIsoDays(startsOn, Math.max(0, Number(jour[1]) - 1));
  const year = Number(startsOn?.slice(0, 4)) || new Date().getUTCFullYear();
  const french = line
    .normalize("NFKC")
    .match(new RegExp(`\\b(\\d{1,2})\\s+(${FRENCH_MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\b`, "i"));
  if (!french) return null;
  const month = FRENCH_MONTHS[french[2].toLocaleLowerCase("fr-FR")];
  if (month == null) return null;
  return new Date(Date.UTC(Number(french[3] || year), month, Number(french[1])))
    .toISOString()
    .slice(0, 10);
}

function headlineFromAiHeading(line: string) {
  let value = line.replace(/^\s*#{1,6}\s*/, "").trim();
  value = value
    .replace(/^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+/i, "")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/, "")
    .replace(/\bJ(?:our)?\s*\d{1,2}\b/i, "")
    .replace(new RegExp(`\\b\\d{1,2}\\s+(?:${FRENCH_MONTH_PATTERN})(?:\\s+20\\d{2})?\\b`, "i"), "")
    .replace(/^[\s·:–—-]+/, "")
    .replace(/[\s·:–—-]+$/, "")
    .trim();
  return value ? value.slice(0, 120) : null;
}

function normalizedHeading(line: string) {
  if (!/^\s*#{1,6}\s+/.test(line)) return "";
  return line
    .replace(/^\s*#{1,6}\s+/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sectionHeadings(notes: string) {
  return notes.replace(/\r/g, "").split("\n").map(normalizedHeading).filter(Boolean);
}

function hasAnyHeading(headings: string[], terms: string[]) {
  return headings.some((heading) => terms.some((term) => heading.includes(term)));
}

function hotelItems(notes: string) {
  const lines = notes.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => {
    const heading = normalizedHeading(line);
    return (
      !!heading &&
      (heading.includes("hotel") ||
        heading.includes("hebergement") ||
        heading === "nuit" ||
        heading.includes("nuit"))
    );
  });
  if (start < 0) return null;
  const items: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*#{1,6}\s+/.test(lines[index])) break;
    if (lines[index].trim()) items.push(lines[index].trim());
  }
  return items.length ? items : null;
}

function ensureUsefulDayPlans(
  days: AiPlusDayPlan[],
  startsOn?: string | null,
  endsOn?: string | null,
  estimateContext?: TravelPriceEstimateContext,
) {
  let lastHotelItems: string[] | null = null;

  return days.map((item, index) => {
    let notes = item.notes.trim();
    const first = startsOn ? item.day === startsOn : index === 0;
    const last = endsOn ? item.day === endsOn : index === days.length - 1;
    let headings = sectionHeadings(notes);
    const currentHotel = hotelItems(notes);
    if (currentHotel) lastHotelItems = currentHotel;

    if (first && headings.length < 3) {
      if (!hasAnyHeading(headings, ["arrivee", "installation", "matin", "apres-midi", "soir"])) {
        notes =
          `### Arrivée / Installation\n- Arrivée à destination, transfert vers l’hébergement et installation selon ton heure d’arrivée.\n${notes}`.trim();
      }
      headings = sectionHeadings(notes);
      if (!hasAnyHeading(headings, ["dejeuner", "diner", "repas"])) {
        notes =
          `${notes}\n### Dîner\n- Repas à proximité de l’hébergement si ton heure d’arrivée le permet · prix à confirmer.`.trim();
      }
    }

    headings = sectionHeadings(notes);
    const afterBoundaryHotel = hotelItems(notes);
    if (afterBoundaryHotel) lastHotelItems = afterBoundaryHotel;

    if (!last && !hasAnyHeading(headings, ["hotel", "hebergement", "nuit"])) {
      const items = lastHotelItems?.length
        ? lastHotelItems
        : ["- Hébergement à confirmer pour cette nuit."];
      notes = `${notes}\n### Hôtel / Nuit\n${items.join("\n")}`.trim();
      lastHotelItems = items;
    }

    headings = sectionHeadings(notes);
    if (last && !hasAnyHeading(headings, ["depart", "transfert", "check-out"])) {
      notes =
        `${notes}\n### Départ / Transfert\n- Préparer le check-out et le transfert selon l’horaire réel de ton transport.`.trim();
    }

    const pricedNotes = estimateContext
      ? enrichAiPlusPricePlaceholders(notes, estimateContext)
      : notes;
    return { ...item, notes: pricedNotes.slice(0, 4_000) };
  });
}

export function splitAiPlusProgramByDay(
  content: string,
  startsOn?: string | null,
  endsOn?: string | null,
  estimateContext?: TravelPriceEstimateContext,
) {
  const lines = String(content || "")
    .replace(/\r/g, "")
    .split("\n");
  const result: AiPlusDayPlan[] = [];
  let current: { day: string; headline: string | null; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const notes = current.lines.join("\n").trim();
    if (notes)
      result.push({ day: current.day, headline: current.headline, notes: notes.slice(0, 4_000) });
  };

  for (const line of lines) {
    if (/^\s*#{2,6}\s+/.test(line)) {
      const day = dayFromAiHeading(line, startsOn);
      if (day) {
        flush();
        current = { day, headline: headlineFromAiHeading(line), lines: [] };
        continue;
      }
      if (
        current &&
        /^\s*##\s+(Budget|Impact sur ton carnet|Alternatives|À vérifier|A vérifier|Sources)/i.test(
          line,
        )
      ) {
        flush();
        current = null;
        continue;
      }
    }
    if (current) current.lines.push(line);
  }
  flush();

  const seen = new Set<string>();
  const filtered = result.filter((item) => {
    if (startsOn && item.day < startsOn) return false;
    if (endsOn && item.day > endsOn) return false;
    if (seen.has(item.day)) return false;
    seen.add(item.day);
    return true;
  });
  return ensureUsefulDayPlans(filtered, startsOn, endsOn, estimateContext);
}

function money(value: string) {
  if (/prix\s+(?:à|a)\s+confirmer|à\s+confirmer|a\s+confirmer/i.test(value)) return null;
  const matches = Array.from(value.replace(/\s/g, "").matchAll(/\d+(?:[.,]\d{1,2})?/g))
    .map((match) => Number(match[0].replace(",", ".")))
    .filter((amount) => Number.isFinite(amount) && amount >= 0);
  if (!matches.length) return null;
  return Math.round(Math.max(...matches) * 100) / 100;
}

export function parseAiPlusBudgetForecasts(
  content: string,
  startsOn?: string | null,
  endsOn?: string | null,
) {
  const grouped = new Map<string, AiPlusBudgetForecast["items"]>();
  for (const raw of String(content || "")
    .replace(/\r/g, "")
    .split("\n")) {
    if (!raw.includes("|") || !/20\d{2}-\d{2}-\d{2}/.test(raw)) continue;
    const cells = raw
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length < 3 || /catégorie|montant prévu/i.test(raw)) continue;
    const day = cells.find((cell) => /^20\d{2}-\d{2}-\d{2}$/.test(cell));
    if (!day || (startsOn && day < startsOn) || (endsOn && day > endsOn)) continue;
    const dayIndex = cells.indexOf(day);
    const category = cells[dayIndex + 1]?.replace(/\*\*/g, "").trim();
    const amount = money(cells[dayIndex + 2] || "");
    const detail = cells[dayIndex + 3]?.replace(/\*\*/g, "").trim() || "Prévision IA+";
    if (!category || amount == null) continue;
    const items = grouped.get(day) ?? [];
    items.push({ category, amount, detail });
    grouped.set(day, items);
  }

  return Array.from(grouped.entries()).map(([day, items]) => ({
    day,
    total: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    items,
  }));
}

export function buildAiPlusApplicationPreview(
  content: string,
  startsOn?: string | null,
  endsOn?: string | null,
) {
  const days = splitAiPlusProgramByDay(content, startsOn, endsOn);
  const budgets = parseAiPlusBudgetForecasts(content, startsOn, endsOn);
  return {
    dayCount: days.length,
    budgetDayCount: budgets.length,
    days: days.map((item) => item.day),
    totalForecast: Math.round(budgets.reduce((sum, item) => sum + item.total, 0) * 100) / 100,
    actionable: days.length > 0 || budgets.length > 0,
  };
}
