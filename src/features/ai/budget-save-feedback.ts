export type AppliedAiPlusResult = {
  appliedDays: number;
  appliedBudgetDays: number;
  totalForecast: number;
};

/**
 * A new itinerary does not necessarily mean a new cost forecast.
 * Keep the save result explicit so the user does not assume a recalculation.
 */
export function aiPlusSaveFeedback(result: AppliedAiPlusResult, safety = false) {
  if (result.appliedBudgetDays > 0) {
    const days = result.appliedDays > 0
      ? `${result.appliedDays} journée${result.appliedDays > 1 ? "s" : ""} et `
      : "";
    return {
      budgetUpdated: true,
      message: `IA+ a enregistré ${days}${result.appliedBudgetDays} prévision${result.appliedBudgetDays > 1 ? "s" : ""} budgétaire${result.appliedBudgetDays > 1 ? "s" : ""}. Le budget du carnet a été actualisé.`,
    };
  }
  if (result.appliedDays > 0) {
    return {
      budgetUpdated: false,
      message: `Programme IA+ enregistré (${result.appliedDays} journée${result.appliedDays > 1 ? "s" : ""}). Budget inchangé : aucune nouvelle prévision compatible n'a été enregistrée.`,
    };
  }
  return {
    budgetUpdated: false,
    message: safety
      ? "Fiche « Avant de partir » enregistrée dans le carnet."
      : "Conseil IA+ enregistré. Le budget du carnet n'a pas été modifié.",
  };
}
