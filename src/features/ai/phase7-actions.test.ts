import { describe, expect, it } from "vitest";
import { detectPremiumIntent } from "./phase7-capabilities";
import {
  buildAiPlusApplicationPreview,
  parseAiPlusBudgetForecasts,
  splitAiPlusProgramByDay,
} from "./phase7-actions";

describe("Phase 7 — séparation gratuit / IA+", () => {
  it("garde une demande d'inspiration simple dans le gratuit", () => {
    expect(detectPremiumIntent("Donne-moi des idées de destinations au soleil").recommended).toBe(false);
  });

  it("repère les demandes qui ont besoin de IA+", () => {
    const result = detectPremiumIntent("Compare les vrais hôtels et applique le meilleur choix dans mon carnet jour par jour");
    expect(result.recommended).toBe(true);
    expect(result.reasons).toContain("real_comparison");
    expect(result.reasons).toContain("apply_changes");
    expect(result.reasons).toContain("full_itinerary");
  });
});

describe("Phase 7 — IA+ agit sur le carnet", () => {
  const answer = `## Recommandation IA+\nPlan optimisé.\n\n### 2026-09-10 · Arrivée\n### Matin\n09:30 · Balade au bord du lac\n### Déjeuner\n- Option A · Restaurant A\n- Option B · Restaurant B\n### Hôtel\n- Option A · Hôtel Centre\n\n### 2026-09-11 · Vieille ville\n### Matin\n10:00 · Visite du marché\n### Dîner\n- Option A · Restaurant C\n\n## Budget\n| Date | Catégorie | Montant prévu | Détail |\n|---|---|---:|---|\n| 2026-09-10 | Restauration | 60 € | Déjeuner + dîner |\n| 2026-09-10 | Transport | 20 € | Bus |\n| 2026-09-11 | Activités | 35,50 € | Entrées |\n\n## À vérifier avant d'agir\nHoraires.`;

  it("sépare strictement les programmes par date", () => {
    const days = splitAiPlusProgramByDay(answer, "2026-09-10", "2026-09-11");
    expect(days).toHaveLength(2);
    expect(days[0].day).toBe("2026-09-10");
    expect(days[0].notes).toContain("Restaurant A");
    expect(days[0].notes).not.toContain("Restaurant C");
    expect(days[1].notes).toContain("Restaurant C");
  });

  it("convertit le budget IA+ en prévisions quotidiennes", () => {
    const budgets = parseAiPlusBudgetForecasts(answer, "2026-09-10", "2026-09-11");
    expect(budgets).toHaveLength(2);
    expect(budgets[0].total).toBe(80);
    expect(budgets[1].total).toBe(35.5);
  });

  it("produit un aperçu d'action avant application", () => {
    expect(buildAiPlusApplicationPreview(answer, "2026-09-10", "2026-09-11")).toEqual({
      dayCount: 2,
      budgetDayCount: 2,
      days: ["2026-09-10", "2026-09-11"],
      totalForecast: 115.5,
      actionable: true,
    });
  });
});
