import { describe, expect, it } from "vitest";
import { aiPlusSaveFeedback } from "./budget-save-feedback";

describe("retour d'enregistrement du budget IA+", () => {
  it("signale explicitement que le programme seul ne recalcule pas le budget", () => {
    const result = aiPlusSaveFeedback({ appliedDays: 8, appliedBudgetDays: 0, totalForecast: 0 });
    expect(result.budgetUpdated).toBe(false);
    expect(result.message).toContain("Budget inchangé");
  });

  it("indique les prévisions réellement sauvegardées", () => {
    const result = aiPlusSaveFeedback({ appliedDays: 2, appliedBudgetDays: 2, totalForecast: 120 });
    expect(result.budgetUpdated).toBe(true);
    expect(result.message).toContain("2 prévisions budgétaires");
  });

  it("ne prétend pas mettre à jour les dépenses lors de l'enregistrement d'un conseil", () => {
    const result = aiPlusSaveFeedback({ appliedDays: 0, appliedBudgetDays: 0, totalForecast: 0 });
    expect(result.budgetUpdated).toBe(false);
    expect(result.message).toContain("n'a pas été modifié");
  });
});
