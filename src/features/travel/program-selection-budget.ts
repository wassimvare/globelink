import type { DayProgramSectionKey } from "./day-program";

export type ProgramBudgetItem = {
  category: string;
  amount: number;
  detail?: string;
};

export type ProgramPriceUnit = "person" | "night" | "total";

export type ProgramBudgetSelection = {
  sectionKey: DayProgramSectionKey;
  optionLabel: string;
  text: string;
  baseOptionText?: string | null;
  selectedPrice?: number | null;
  basePrice?: number | null;
  priceUnit?: ProgramPriceUnit | null;
  basePriceUnit?: ProgramPriceUnit | null;
};

export type ProgramPrice = {
  amount: number;
  unit: ProgramPriceUnit;
};

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeForecastCategory(value: string) {
  const text = normalizeText(value);
  if (/hotel|hebergement|nuit|logement/.test(text)) return "accommodation";
  if (/restauration|restaurant|repas|dejeuner|diner|petit-dejeuner/.test(text)) return "food";
  if (/transport|trajet|deplacement|metro|bus|tram|train|taxi|tcl/.test(text)) return "transport";
  if (/activite|entree|billet|visite|extra|loisir|musee|souvenir|shopping/.test(text)) return "activities";
  return text.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other";
}

export function budgetCategoryForSection(sectionKey: DayProgramSectionKey, text = "") {
  if (sectionKey === "lunch" || sectionKey === "dinner") return "food";
  if (sectionKey === "hotel") return "accommodation";
  if (/transport|trajet|metro|bus|tram|train|taxi|tcl/i.test(text)) return "transport";
  if (["morning", "afternoon", "evening", "other"].includes(sectionKey)) return "activities";
  return "other";
}

function parseAmount(raw: string) {
  const amount = Number(raw.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

function inferPriceUnit(text: string, index: number): ProgramPriceUnit {
  const context = normalizeText(text.slice(Math.max(0, index - 24), index + 100));
  if (/\b(?:au\s+)?total\b|\btotal\s*(?:pour|:)/.test(context)) return "total";
  if (/\/\s*(?:pers|personne)|par\s+(?:pers|personne)|\bpersonne\b/.test(context)) return "person";
  if (/\/\s*nuit|par\s+nuit|\bnuit\b/.test(context)) return "night";
  return "total";
}

export function parseProgramPrice(value: string | null | undefined): ProgramPrice | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  // Si IA+ fournit à la fois un prix unitaire et le total du groupe, le total
  // est prioritaire pour éviter de multiplier deux fois au moment du carnet.
  const explicitTotalPatterns = [
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\s*(?:au\s+)?total\b/i,
    /\btotal\s*(?::|≈|~|-|–)?\s*(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  ];
  for (const pattern of explicitTotalPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseAmount(match[1]);
    if (amount != null) return { amount, unit: "total" };
  }

  // Pour une fourchette, on garde la borne haute : le budget ne doit pas être
  // artificiellement optimiste.
  const range = text.match(
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:-|–|—|à)\s*(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  );
  if (range) {
    const low = parseAmount(range[1]);
    const high = parseAmount(range[2]);
    if (low != null && high != null) {
      return {
        amount: Math.max(low, high),
        unit: inferPriceUnit(text, range.index ?? 0),
      };
    }
  }

  const match = text.match(
    /(\d{1,5}(?:[\s\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|eur)\b/i,
  );
  if (!match) return null;
  const amount = parseAmount(match[1]);
  if (amount == null) return null;
  return { amount, unit: inferPriceUnit(text, match.index ?? 0) };
}

export function buildProgramBudgetSelection(args: {
  sectionKey: DayProgramSectionKey;
  optionLabel: string;
  text: string;
  baseOptionText?: string | null;
}): ProgramBudgetSelection {
  const selected = parseProgramPrice(args.text);
  const base = parseProgramPrice(args.baseOptionText);
  return {
    sectionKey: args.sectionKey,
    optionLabel: args.optionLabel,
    text: args.text,
    baseOptionText: args.baseOptionText ?? null,
    selectedPrice: selected?.amount ?? null,
    basePrice: base?.amount ?? null,
    priceUnit: selected?.unit ?? null,
    basePriceUnit: base?.unit ?? null,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function travelerCount(value: number | null | undefined) {
  if (!Number.isFinite(Number(value)) || Number(value) < 1) return 1;
  return Math.min(50, Math.max(1, Math.round(Number(value))));
}

function effectivePrice(
  amount: number | null | undefined,
  unit: ProgramPriceUnit | null | undefined,
  travelers: number,
) {
  if (amount == null || !Number.isFinite(amount)) return null;
  return roundMoney(amount * (unit === "person" ? travelers : 1));
}

function compactSelection(selection: ProgramBudgetSelection, travelers: number) {
  const section =
    selection.sectionKey === "lunch"
      ? "Déjeuner"
      : selection.sectionKey === "dinner"
        ? "Dîner"
        : selection.sectionKey === "hotel"
          ? "Hôtel"
          : selection.sectionKey === "morning"
            ? "Matin"
            : selection.sectionKey === "afternoon"
              ? "Après-midi"
              : selection.sectionKey === "evening"
                ? "Soir"
                : "Choix";

  if (selection.selectedPrice == null) {
    return `${section}: ${selection.optionLabel} · ${selection.text} · prix à confirmer`;
  }

  const price = roundMoney(selection.selectedPrice);
  if (selection.priceUnit === "person") {
    const total = effectivePrice(price, "person", travelers) ?? price;
    return `${section}: ${selection.optionLabel} · ${selection.text} · ${price.toFixed(2)} €/pers. × ${travelers} = ${total.toFixed(2)} € total`;
  }
  if (selection.priceUnit === "night") {
    return `${section}: ${selection.optionLabel} · ${selection.text} · ${price.toFixed(2)} €/nuit`;
  }
  return `${section}: ${selection.optionLabel} · ${selection.text} · ${price.toFixed(2)} € total`;
}

export function recalculateForecastFromSelections(
  baseItems: ProgramBudgetItem[],
  selections: ProgramBudgetSelection[],
  tripTravelers: number | null | undefined = 1,
) {
  const travelers = travelerCount(tripTravelers);
  const safeBase = baseItems.map((item) => ({
    category: String(item.category || "Autres"),
    amount: roundMoney(Math.max(0, Number(item.amount || 0))),
    detail: String(item.detail || "Prévision IA+"),
  }));

  const items = safeBase.map((item) => {
    const categoryKey = normalizeForecastCategory(item.category);
    const related = selections.filter(
      (selection) => budgetCategoryForSection(selection.sectionKey, selection.text) === categoryKey,
    );
    if (!related.length) return item;

    let adjustment = 0;
    let selectedFloor = 0;
    for (const selection of related) {
      const selectedEffective = effectivePrice(
        selection.selectedPrice,
        selection.priceUnit,
        travelers,
      );
      const baseEffective = effectivePrice(
        selection.basePrice,
        selection.basePriceUnit,
        travelers,
      );
      if (selectedEffective != null) selectedFloor += selectedEffective;
      if (
        selectedEffective != null &&
        baseEffective != null &&
        selection.priceUnit === selection.basePriceUnit
      ) {
        adjustment += selectedEffective - baseEffective;
      }
    }

    const adjusted = Math.max(0, item.amount + adjustment);
    const amount = roundMoney(Math.max(adjusted, selectedFloor));
    return {
      ...item,
      amount,
      detail: `${item.detail} · ${related.map((selection) => compactSelection(selection, travelers)).join(" · ")}`.slice(0, 900),
    };
  });

  return {
    items,
    total: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)),
    selections: selections.map((selection) => ({
      sectionKey: selection.sectionKey,
      optionLabel: selection.optionLabel,
      text: selection.text,
      selectedPrice: selection.selectedPrice ?? null,
      priceUnit: selection.priceUnit ?? null,
      effectivePrice: effectivePrice(selection.selectedPrice, selection.priceUnit, travelers),
    })),
  };
}
