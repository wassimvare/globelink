import { describe, expect, it } from "vitest";

import {
  buildProgramBudgetSelection,
  recalculateForecastFromSelections,
} from "@/features/travel/program-selection-budget";

describe("program selection budget", () => {
  it("maps saved program choices to their selected estimates", () => {
    const programs = [
      {
        date: "2026-08-22",
        options: [
          {
            id: "2026-08-22:lunch:1",
            kind: "lunch" as const,
            label: "Déjeuner",
            optionA: "Bistrot central",
            optionB: "Version légère",
            lineA: "Bistrot central — env. 25 €/pers.",
            lineB: "Version légère — env. 18 €/pers.",
            selected: "b" as const,
          },
          {
            id: "2026-08-22:activity:1",
            kind: "activity" as const,
            label: "Activité",
            optionA: "Musée",
            optionB: null,
            lineA: "Musée — env. 15 € au total",
            lineB: null,
            selected: "a" as const,
          },
        ],
      },
    ];

    const selections = buildProgramBudgetSelection(programs);
    expect(selections).toMatchObject([
      {
        kind: "lunch",
        selectedKey: "b",
        selectedPrice: 18,
        basePrice: 25,
        priceUnit: "person",
        basePriceUnit: "person",
      },
      {
        kind: "activity",
        selectedKey: "a",
        selectedPrice: 15,
        basePrice: 15,
        priceUnit: "total",
        basePriceUnit: "total",
      },
    ]);
  });

  it("recalculates forecast categories from A/B choices without undercutting selected prices", () => {
    const base = [
      {
        category: "Restauration",
        amount: 45,
        detail: "Repas prévus.",
      },
      {
        category: "Hébergement",
        amount: 70,
        detail: "Nuit prévue.",
      },
    ];
    const selections = buildProgramBudgetSelection([
      {
        date: "2026-08-22",
        options: [
          {
            id: "lunch",
            kind: "lunch" as const,
            label: "Déjeuner",
            optionA: "Option A",
            optionB: "Option B",
            lineA: "Option A — env. 20 €/pers.",
            lineB: "Option B — env. 10 €/pers.",
            selected: "b" as const,
          },
          {
            id: "dinner",
            kind: "dinner" as const,
            label: "Dîner",
            optionA: "Option A",
            optionB: null,
            lineA: "Option A — env. 22 €/pers.",
            lineB: null,
            selected: "a" as const,
          },
          {
            id: "hotel",
            kind: "hotel" as const,
            label: "Hôtel",
            optionA: "Hotel A",
            optionB: null,
            lineA: "Hotel A — env. 75 €/nuit",
            lineB: null,
            selected: "a" as const,
          },
        ],
      },
    ]);

    const result = recalculateForecastFromSelections(base, selections);
    expect(result[0]?.amount).toBe(32);
    expect(result[1]?.amount).toBe(75);
    expect(result[0]?.detail).toContain("B — Option B");
  });

  it("multiplies per-person selections by the trip traveler count", () => {
    const base = [
      { category: "Restauration", amount: 45, detail: "Repas prévus." },
      { category: "Hébergement", amount: 70, detail: "Nuit prévue." },
    ];
    const selections = buildProgramBudgetSelection([
      {
        date: "2026-08-22",
        options: [
          {
            id: "lunch",
            kind: "lunch" as const,
            label: "Déjeuner",
            optionA: "Option A",
            optionB: "Option B",
            lineA: "Option A — env. 20 €/pers.",
            lineB: "Option B — env. 10 €/pers.",
            selected: "b" as const,
          },
          {
            id: "dinner",
            kind: "dinner" as const,
            label: "Dîner",
            optionA: "Option A",
            optionB: null,
            lineA: "Option A — env. 22 €/pers.",
            lineB: null,
            selected: "a" as const,
          },
          {
            id: "hotel",
            kind: "hotel" as const,
            label: "Hôtel",
            optionA: "Hotel A",
            optionB: null,
            lineA: "Hotel A — env. 75 €/nuit",
            lineB: null,
            selected: "a" as const,
          },
        ],
      },
    ]);

    const result = recalculateForecastFromSelections(base, selections, 2);
    expect(result[0]?.amount).toBe(64);
    expect(result[1]?.amount).toBe(75);
    expect(result[0]?.detail).toContain("10 €/pers. × 2 = 20 € total");
  });

  it("prefers an explicit party total and uses the high end of a range", () => {
    const selections = buildProgramBudgetSelection([
      {
        date: "2026-08-22",
        options: [
          {
            id: "meal",
            kind: "lunch" as const,
            label: "Déjeuner",
            optionA: "Menu",
            optionB: null,
            lineA: "Menu — env. 20 €/pers. · 40 € total pour 2 pers.",
            lineB: null,
            selected: "a" as const,
          },
          {
            id: "activity",
            kind: "activity" as const,
            label: "Activité",
            optionA: "Visite",
            optionB: null,
            lineA: "Visite — env. 20–30 €/pers.",
            lineB: null,
            selected: "a" as const,
          },
        ],
      },
    ]);

    expect(selections[0]).toMatchObject({ selectedPrice: 40, priceUnit: "total" });
    expect(selections[1]).toMatchObject({ selectedPrice: 30, priceUnit: "person" });
  });
});
