import { buildTripDateRange } from "@/features/travel/trip-journey";
import { evaluateAiPlusBudgetCeiling, type AiPlusBudgetForecast } from "@/features/ai/phase7-actions";

const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"] as const;
function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Match one explicit day of the current trip, without inventing a year. */
export function resolveAiPlusRequestedDay(query: string, startsOn?: string | null, endsOn?: string | null): string | null {
  if (!startsOn || !endsOn) return null;
  const days = buildTripDateRange(startsOn, endsOn, 366);
  if (!days.length) return null;
  const text = plain(query);
  if (/\b(toutes? les journees?|tous les jours?|voyage complet|sejour complet|ensemble du sejour|chaque jour|tout (?:le|mon) voyage)\b/.test(text)) return null;
  if (!/\b(journee?|jour|mercredi|lundi|mardi|jeudi|vendredi|samedi|dimanche)\b/.test(text)) return null;

  const iso = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]).filter((day) => days.includes(day));
  if (iso.length === 1) return iso[0];
  if (iso.length > 1) return null;

  const matches = [...text.matchAll(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(20\d{2}))?\b/g)];
  if (matches.length !== 1) return null;
  const [, dayNumber, month, year] = matches[0];
  const monthNumber = MONTHS.indexOf(month as (typeof MONTHS)[number]) + 1;
  if (!monthNumber) return null;
  const candidates = days.filter((day) => {
    const [y, m, d] = day.split("-").map(Number);
    return d === Number(dayNumber) && m === monthNumber && (!year || y === Number(year));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Never apply an unrelated generated day in single-day mode. */
export function keepAiPlusAnswerOnDay(content: string, day: string): string {
  let currentDay: string | null = null;
  return content.split("\n").filter((line) => {
    const heading = /^\s*###\s+(20\d{2}-\d{2}-\d{2})\b/.exec(line);
    if (heading) {
      currentDay = heading[1];
      return currentDay === day;
    }
    if (/^\s*##\s+[^#]/.test(line)) currentDay = null;
    if (currentDay !== null && currentDay !== day) return false;
    const tableDate = /^\s*\|\s*(20\d{2}-\d{2}-\d{2})\s*\|/.exec(line);
    if (tableDate && tableDate[1] !== day) return false;
    return true;
  }).join("\n");
}

/** Keep the itinerary but never apply or present an unaffordable budget table as viable. */

export function isAiPlusTripReorganization(query: string): boolean {
  return /\b(?:reorganis\w*|optimis\w*|replanifi\w*|reamenag\w*|redui\w* les trajets)\b/i.test(plain(query));
}

/** No fabricated zero-cost budget: show the itinerary as a proposal, without a budget to apply. */
export function dropUnaffordableAiPlusBudget(
  content: string,
  scope: "day" | "trip" = "day",
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let inBudget = false;
  for (const line of lines) {
    if (/^##\s+Budget(?:\s|$)/i.test(line.trim())) {
      inBudget = true;
      continue;
    }
    if (inBudget && /^##\s+[^#]/.test(line)) inBudget = false;
    if (!inBudget && !/^\s*\|\s*20\d{2}-\d{2}-\d{2}\s*\|/.test(line)) {
      result.push(line);
    }
  }
  const warning = scope === "trip"
    ? "Le programme proposé pour le groupe est une piste de réorganisation, pas un séjour financièrement validé. Les prix envisagés dépassent le budget total enregistré : aucun nouveau budget n'est appliqué au carnet. Les dépenses et prévisions existantes restent inchangées. Vérifie les coûts réels, privilégie les activités gratuites ou réduis les options payantes ; si le coût incompressible dépasse le plafond, il faut adapter la durée, les prestations ou le budget."
    : "Le programme de cette journée peut être réorganisé, mais sa nouvelle prévision de dépenses ne respecte pas le plafond du voyage. Aucun montant hors budget ne sera appliqué au carnet : vérifie ou ajuste les options payantes avant de modifier le budget. Les prévisions déjà enregistrées restent inchangées.";
  return result.join("\n").trim() + "\n\n## À vérifier avant d'agir\n" + warning;
}

export type ExistingAiPlusForecast = { day: string | null; amount: number };
/** Count planned costs on untouched dates without double-counting the replaced date. */
export function evaluateAiPlusBudgetWithExisting(
  newForecasts: AiPlusBudgetForecast[],
  budget: number | null | undefined,
  actualSpent: number | null | undefined,
  existing: ExistingAiPlusForecast[],
) {
  const replacementDays = new Set(newForecasts.map(({ day }) => day));
  const reserved = Math.round(existing
    .filter((item) => !item.day || !replacementDays.has(item.day))
    .reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0) * 100) / 100;
  const realSpent = Math.max(0, Number(actualSpent) || 0);
  return { ...evaluateAiPlusBudgetCeiling(newForecasts, budget, realSpent + reserved), reserved, realSpent };
}
