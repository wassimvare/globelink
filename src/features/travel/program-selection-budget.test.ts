import { describe, expect, it } from "vitest";
import {
  buildProgramBudgetSelection,
  parseProgramPrice,
  recalculateForecastFromSelections,
} from "./program-selection-budget";

describe("carnet — choix IA+ et budget", () => {
  it("lit les prix par personne et par nuit", () => {
    expect(parseProgramPrice("Bouchon lyonnais (env. 25 € / pers.)")).toEqual({ amount: 25, unit: "person" });
    expect(parseProgramPrice("Hôtel central (env. 110 € / nuit)")).toEqual({ amount: 110, unit: "night" });
  });

  it("remplace le coût hôtel par le choix réellement sélectionné", () => {
    const hotel = buildProgramBudgetSelection({
      sectionKey: "hotel",
      optionLabel: "Option B",
      text: "Hôtel économique (env. 75 € / nuit)",
      baseOptionText: "Hôtel centre (env. 110 € / nuit)",
    });
    const result = recalculateForecastFromSelections(
      [
        { category: "Hébergement", amount: 90, detail: "Nuitée moyenne" },
        { category: "Restauration", amount: 45, detail: "Déjeuner + dîner" },
      ],
      [hotel],
    );
    expect(result.items[0].amount).toBe(75);
    expect(result.total).toBe(120);
    expect(result.items[0].detail).toContain("Option B");
  });

  it("garde une restauration cohérente quand déjeuner et dîner changent", () => {
    const lunch = buildProgramBudgetSelection({
      sectionKey: "lunch",
      optionLabel: "Option B",
      text: "Boulangerie (env. 10 € / pers.)",
      baseOptionText: "Bouchon (env. 25 € / pers.)",
    });
    const dinner = buildProgramBudgetSelection({
      sectionKey: "dinner",
      optionLabel: "Option B",
      text: "Restaurant Jacobins (env. 22 € / pers.)",
      baseOptionText: "Brasserie (env. 35 € / pers.)",
    });
    const result = recalculateForecastFromSelections(
      [{ category: "Restauration", amount: 45, detail: "Repas du jour" }],
      [lunch, dinner],
    );
    expect(result.items[0].amount).toBe(32);
    expect(result.total).toBe(32);
  });

  it("conserve le budget si le nouveau choix n'a pas de prix vérifiable", () => {
    const hotel = buildProgramBudgetSelection({
      sectionKey: "hotel",
      optionLabel: "Option C",
      text: "OKKO Hôtels Lyon Pont Lafayette — prix à confirmer",
      baseOptionText: "Hôtel Globe et Cecil — prix à confirmer",
    });
    const result = recalculateForecastFromSelections(
      [{ category: "Hébergement", amount: 120, detail: "Nuitée estimée" }],
      [hotel],
    );
    expect(result.total).toBe(120);
    expect(result.items[0].detail).toContain("prix à confirmer");
  });
});
