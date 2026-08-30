import type { DayProgramSectionKey } from "./day-program";

export type ProgramBudgetItem = {
  category: string;
  amount: number;
  detail?: string;
};

export type ProgramBudgetSelection = {
  sectionKey: DayProgramSectionKey;
  optionLabel: string;
  text: string;
  baseOptionText?: string | null;
  selectedPrice?: number | null;
  basePrice?: number | null;
  priceUnit?: "person" | "night" | "total" | null;
  basePriceUnit?: "person" | "night" | "total" | null;
};

export type ProgramPrice = {
  amount: number;
  unit: "person" | "night" | "total";
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

export function parseProgramPrice(value: string | null | undefined): ProgramPrice | null {
  const text = String(value ?? "").replace(/\s+/g, " ");
  const matches = Array.from(text.matchAll(/([0-9]+(?:[.,][0-9]{1,2})?)\s*€/g));
  if (!matches.length) return null;
  const amount = Number(matches[0][1].replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) return null;
  const tail = text.slice(matches[0].index ?? 0).toLowerCase();
  const unit = /\/\s*(?:pers|personne)|par\s+personne|personne/.test(tail)
    ? "person"
    : /\/\s*nuit|par\s+nuit|nuit/.test(tail)
      ? "night"
      : "total";
  return { amount: Math.round(amount * 100) / 100, unit };
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

function compactSelection(selection: ProgramBudgetSelection) {
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
  const price = selection.selectedPrice == null
    ? "prix à confirmer"
    : `${selection.selectedPrice.toFixed(2)} €${selection.priceUnit === "person" ? "/pers." : selection.priceUnit === "night" ? "/nuit" : ""}`;
  return `${section}: ${selection.optionLabel} · ${selection.text} · ${price}`;
}

export function recalculateForecastFromSelections(
  baseItems: ProgramBudgetItem[],
  selections: ProgramBudgetSelection[],
) {
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
      if (selection.selectedPrice != null) selectedFloor += selection.selectedPrice;
      if (
        selection.selectedPrice != null &&
        selection.basePrice != null &&
        selection.priceUnit === selection.basePriceUnit
      ) {
        adjustment += selection.selectedPrice - selection.basePrice;
      }
    }

    const adjusted = Math.max(0, item.amount + adjustment);
    const amount = roundMoney(Math.max(adjusted, selectedFloor));
    return {
      ...item,
      amount,
      detail: `${item.detail} · ${related.map(compactSelection).join(" · ")}`.slice(0, 900),
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
    })),
  };
}
