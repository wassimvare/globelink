import type { BudgetForecastItem } from "@/features/ai/phase7-actions";
import type { DayProgram, ProgramOption, ProgramOptionKind } from "@/features/travel/day-program";

export type ProgramPriceUnit = "person" | "night" | "total";

export type ProgramBudgetSelection = {
  id: string;
  date: string;
  kind: ProgramOptionKind;
  selectedKey: "a" | "b";
  selectedLabel: string;
  selectedLine: string;
  selectedPrice: number | null;
  basePrice: number | null;
  priceUnit: ProgramPriceUnit | null;
  basePriceUnit: ProgramPriceUnit | null;
};

const CATEGORY_KIND_MATCHES: Array<{ markers: string[]; kinds: ProgramOptionKind[] }> = [
  { markers: ["héberg", "hotel", "hôtel", "logement", "nuit"], kinds: ["hotel"] },
  { markers: ["restau", "repas", "food", "déjeuner", "dîner", "diner"], kinds: ["breakfast", "lunch", "dinner"] },
  { markers: ["activ", "visite", "billet", "musée", "musee", "excursion"], kinds: ["activity"] },
  { markers: ["transport", "trajet", "taxi", "métro", "metro", "bus", "train"], kinds: ["transport", "stop"] },
];

const KIND_CATEGORY_FALLBACKS: Record<ProgramOptionKind, string> = {
  hotel: "Hébergement",
  breakfast: "Restauration",
  lunch: "Restauration",
  dinner: "Restauration",
  activity: "Activités",
  transport: "Transport",
  stop: "Transport",
};

function cleanText(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalize(value: unknown) {
  return cleanText(value, 500).toLocaleLowerCase("fr-FR");
}

function optionKey(option: ProgramOption) {
  return option.selected === "b" ? "b" : "a";
}

function selectedLabel(option: ProgramOption) {
  return option.selected === "b" && option.optionB ? option.optionB : option.optionA;
}

function selectedLine(option: ProgramOption) {
  return option.selected === "b" && option.lineB ? option.lineB : option.lineA;
}

function parseAmount(raw: string) {
  const normalized = raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function inferPriceUnit(text: string, matchIndex: number): ProgramPriceUnit {
  const context = normalize(text.slice(Math.max(0, matchIndex - 28), matchIndex + 100));
  if (/\b(?:au\s+)?total\b|\btotal\s*(?:pour|:)\b/.test(context)) return "total";
  if (/\/\s*pers\.?|par personne|par pers\.?|\bpersonne\b/.test(context)) return "person";
  if (/\/\s*nuit|par nuit|la nuit|\bchambre\b.{0,24}\bnuit\b|\bnuit\b.{0,24}\bchambre\b/.test(context)) {
    return "night";
  }
  return "total";
}

function parseProgramPrice(value: unknown) {
  const text = cleanText(value, 500);
  if (!text) return { amount: null, unit: null as ProgramPriceUnit | null };

  // Quand IA+ affiche un prix unitaire ET un total calculé, le total fait foi
  // pour le budget. Exemple : "20 €/pers. · 40 € total pour 2 pers.".
  const explicitTotalPatterns = [
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\s*(?:au\s+)?total\b/i,
    /\btotal\s*(?::|≈|~|-|–)?\s*(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  ];
  for (const pattern of explicitTotalPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseAmount(match[1]);
    if (amount !== null) return { amount, unit: "total" as ProgramPriceUnit };
  }

  // Pour une fourchette, retenir la borne haute évite de sous-estimer le carnet.
  const rangeMatch = text.match(
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:-|–|—|à)\s*(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  );
  if (rangeMatch) {
    const low = parseAmount(rangeMatch[1]);
    const high = parseAmount(rangeMatch[2]);
    if (low !== null && high !== null) {
      return {
        amount: Math.max(low, high),
        unit: inferPriceUnit(text, rangeMatch.index ?? 0),
      };
    }
  }

  const match = text.match(
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  );
  if (!match) return { amount: null, unit: null as ProgramPriceUnit | null };
  const amount = parseAmount(match[1]);
  if (amount === null) return { amount: null, unit: null as ProgramPriceUnit | null };

  return {
    amount,
    unit: inferPriceUnit(text, match.index ?? 0),
  };
}

function sameUnit(a: ReturnType<typeof parseProgramPrice>, b: ReturnType<typeof parseProgramPrice>) {
  if (a.amount === null || b.amount === null) return false;
  if (!a.unit || !b.unit) return true;
  return a.unit === b.unit;
}

function categoryMatchesKind(category: string, kind: ProgramOptionKind) {
  const normalizedCategory = normalize(category);
  return CATEGORY_KIND_MATCHES.some(
    (group) =>
      group.kinds.includes(kind) &&
      group.markers.some((marker) => normalizedCategory.includes(marker)),
  );
}

function fallbackCategory(kind: ProgramOptionKind) {
  return KIND_CATEGORY_FALLBACKS[kind] ?? "Autres";
}

function normalizedTravelerCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(50, Math.max(1, Math.round(parsed)));
}

function effectiveAmount(
  amount: number | null,
  unit: ProgramPriceUnit | null,
  travelerCount: number,
) {
  if (amount === null) return null;
  return amount * (unit === "person" ? travelerCount : 1);
}

function compactSelection(selection: ProgramBudgetSelection, travelerCount: number) {
  if (selection.selectedPrice === null) {
    return `${selection.selectedKey.toUpperCase()} — ${selection.selectedLabel}`;
  }

  const roundedPrice = Math.round(selection.selectedPrice * 100) / 100;
  if (selection.priceUnit === "person") {
    const total = Math.round(roundedPrice * travelerCount * 100) / 100;
    return `${selection.selectedKey.toUpperCase()} — ${selection.selectedLabel} · ${roundedPrice} €/pers. × ${travelerCount} = ${total} € total`;
  }
  if (selection.priceUnit === "night") {
    return `${selection.selectedKey.toUpperCase()} — ${selection.selectedLabel} · ${roundedPrice} €/nuit`;
  }
  return `${selection.selectedKey.toUpperCase()} — ${selection.selectedLabel} · ${roundedPrice} € total`;
}

export function buildProgramBudgetSelection(
  programs: DayProgram[],
): ProgramBudgetSelection[] {
  return programs.flatMap((program) =>
    program.options.map((option) => {
      const selected = parseProgramPrice(selectedLine(option));
      const base = parseProgramPrice(option.lineA);
      return {
        id: option.id,
        date: program.date,
        kind: option.kind,
        selectedKey: optionKey(option),
        selectedLabel: selectedLabel(option),
        selectedLine: selectedLine(option),
        selectedPrice: selected.amount,
        basePrice: base.amount,
        priceUnit: selected.unit,
        basePriceUnit: base.unit,
      };
    }),
  );
}

export function recalculateForecastFromSelections(
  baseItems: BudgetForecastItem[],
  selections: ProgramBudgetSelection[],
  travelers: number | null | undefined = 1,
): BudgetForecastItem[] {
  if (!baseItems.length || !selections.length) return baseItems;

  const travelerCount = normalizedTravelerCount(travelers);
  const nextItems = baseItems.map((item) => ({ ...item }));
  const adjustments = new Map<number, number>();
  const selectionFloor = new Map<number, number>();
  const selectionDetails = new Map<number, string[]>();

  selections.forEach((selection) => {
    const selectedEffective = effectiveAmount(
      selection.selectedPrice,
      selection.priceUnit,
      travelerCount,
    );
    if (selectedEffective === null) return;

    let itemIndex = nextItems.findIndex((item) => categoryMatchesKind(item.category, selection.kind));
    if (itemIndex < 0 && nextItems.length) itemIndex = 0;
    if (itemIndex < 0) {
      nextItems.push({
        category: fallbackCategory(selection.kind),
        amount: 0,
        detail: "Prévision créée automatiquement depuis le programme choisi.",
      });
      itemIndex = nextItems.length - 1;
    }

    selectionFloor.set(itemIndex, (selectionFloor.get(itemIndex) ?? 0) + selectedEffective);
    const selectedParsed = {
      amount: selection.selectedPrice,
      unit: selection.priceUnit,
    };
    const baseParsed = {
      amount: selection.basePrice,
      unit: selection.basePriceUnit,
    };
    const baseEffective = effectiveAmount(
      selection.basePrice,
      selection.basePriceUnit,
      travelerCount,
    );
    if (sameUnit(baseParsed, selectedParsed) && baseEffective !== null) {
      adjustments.set(
        itemIndex,
        (adjustments.get(itemIndex) ?? 0) + (selectedEffective - baseEffective),
      );
    }
    const details = selectionDetails.get(itemIndex) ?? [];
    details.push(compactSelection(selection, travelerCount));
    selectionDetails.set(itemIndex, details);
  });

  return nextItems.map((item, itemIndex) => {
    const adjusted = item.amount + (adjustments.get(itemIndex) ?? 0);
    const floor = selectionFloor.get(itemIndex) ?? 0;
    const amount = Math.max(adjusted, floor, 0);
    const details = selectionDetails.get(itemIndex) ?? [];
    return {
      ...item,
      amount: Math.round(amount * 100) / 100,
      detail: details.length
        ? `${cleanText(item.detail, 320)} Programme choisi: ${details.join(" · ")}`.trim()
        : item.detail,
    };
  });
}
