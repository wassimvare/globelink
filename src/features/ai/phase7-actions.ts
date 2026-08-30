export type AiPlusDayPlan = { day: string; notes: string };
export type AiPlusBudgetForecast = {
  day: string;
  total: number;
  items: Array<{ category: string; amount: number; detail: string }>;
};

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, décembre: 11,
};

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
  const french = line.normalize("NFKC").match(/\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(20\d{2}))?\b/i);
  if (!french) return null;
  const month = FRENCH_MONTHS[french[2].toLocaleLowerCase("fr-FR")];
  if (month == null) return null;
  return new Date(Date.UTC(Number(french[3] || year), month, Number(french[1]))).toISOString().slice(0, 10);
}

export function splitAiPlusProgramByDay(content: string, startsOn?: string | null, endsOn?: string | null) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const result: AiPlusDayPlan[] = [];
  let current: { day: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const notes = current.lines.join("\n").trim();
    if (notes) result.push({ day: current.day, notes: notes.slice(0, 4_000) });
  };

  for (const line of lines) {
    if (/^\s*#{2,6}\s+/.test(line)) {
      const day = dayFromAiHeading(line, startsOn);
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

function money(value: string) {
  const match = value.replace(/\s/g, "").match(/(-?\d+(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export function parseAiPlusBudgetForecasts(content: string, startsOn?: string | null, endsOn?: string | null) {
  const grouped = new Map<string, AiPlusBudgetForecast["items"]>();
  for (const raw of String(content || "").replace(/\r/g, "").split("\n")) {
    if (!raw.includes("|") || !/20\d{2}-\d{2}-\d{2}/.test(raw)) continue;
    const cells = raw.split("|").map((cell) => cell.trim()).filter(Boolean);
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

export function buildAiPlusApplicationPreview(content: string, startsOn?: string | null, endsOn?: string | null) {
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
