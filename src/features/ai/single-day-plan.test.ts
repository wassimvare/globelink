import { describe, expect, it } from "vitest";
import { parseAiPlusBudgetForecasts, splitAiPlusProgramByDay } from "./phase7-actions";
import { dropUnaffordableAiPlusBudget, evaluateAiPlusBudgetWithExisting, keepAiPlusAnswerOnDay, resolveAiPlusRequestedDay, isAiPlusTripReorganization } from "./single-day-plan";

describe("IA+ — réorganisation d'une seule journée", () => {
  it("reconnaît la journée française du voyage", () => {
    expect(resolveAiPlusRequestedDay("Organise précisément la journée du mercredi 16 décembre dans mon voyage GlobeLink.", "2026-12-14", "2026-12-21")).toBe("2026-12-16");
    expect(resolveAiPlusRequestedDay("Optimise le jour 2026-12-16", "2026-12-14", "2026-12-21")).toBe("2026-12-16");
  });
  it("préserve le mode voyage complet ou une date hors séjour", () => {
    expect(resolveAiPlusRequestedDay("Réorganise tout mon voyage", "2026-12-14", "2026-12-21")).toBeNull();
    expect(resolveAiPlusRequestedDay("Organise toutes les journées du séjour", "2026-12-14", "2026-12-21")).toBeNull();
    expect(resolveAiPlusRequestedDay("Organise la journée du 16 novembre", "2026-12-14", "2026-12-21")).toBeNull();
    expect(resolveAiPlusRequestedDay("Organise la journée du 16 décembre", null, "2026-12-21")).toBeNull();
  });
  it("écarte les jours et dépenses hors périmètre", () => {
    const answer = ["## Recommandation IA+","Trajets optimisés","### 2026-12-15 · Veille","À supprimer","### 2026-12-16 · Journée","### Matin","- Musée","### 2026-12-17 · Lendemain","À supprimer aussi","## Budget","| Date | Catégorie | Montant prévu | Détail |","|---|---|---:|---|","| 2026-12-15 | Transport | 50 € | Bus |","| 2026-12-16 | Transport | 20 € | Métro |","| 2026-12-17 | Hôtel | 99 € | Nuit |"].join("\n");
    const actual = keepAiPlusAnswerOnDay(answer, "2026-12-16");
    expect(actual).toContain("### 2026-12-16");
    expect(actual).toContain("20 €");
    expect(actual).not.toContain("2026-12-15");
    expect(actual).not.toContain("2026-12-17");
    expect(actual).not.toContain("À supprimer");
  });
  it("écarte le tableau de dépenses hors budget, pas le planning", () => {
    const actual = dropUnaffordableAiPlusBudget("## Recommandation IA+\nPlan optimisé\n### 2026-12-16 · Ville\n### Matin\n- Visite\n## Budget\n| 2026-12-16 | Hôtel | 1551 € | Nuit |\n## Alternatives\n- Marcher");
    expect(actual).toContain("### 2026-12-16");
    expect(actual).not.toContain("1551 €");
    expect(actual).toContain("## Alternatives");
    expect(actual).toContain("Aucun montant hors budget");
  });
  it("compte les jours déjà prévus sans recompter le jour remplacé", () => {
    const existing = [{ day: "2026-12-15", amount: 300 }, { day: "2026-12-16", amount: 80 }];
    const okay = evaluateAiPlusBudgetWithExisting([{ day: "2026-12-16", total: 120, items: [] }], 500, 50, existing);
    expect(okay.realSpent).toBe(50);
    expect(okay.reserved).toBe(300);
    expect(okay.totalWithSpent).toBe(470);
    expect(okay.exceeded).toBe(false);
    expect(evaluateAiPlusBudgetWithExisting([{ day: "2026-12-16", total: 200, items: [] }], 500, 50, existing).exceeded).toBe(true);
  });
});


describe("IA+ — voyage complet avec groupe et budget insuffisant", () => {
  it("reconnaît le bouton de réorganisation du séjour", () => {
    expect(isAiPlusTripReorganization("Réorganise mon voyage enregistré pour réduire les trajets inutiles, garder un bon rythme et respecter mon budget.")).toBe(true);
    expect(isAiPlusTripReorganization("Organise un voyage complet avec budget pour deux personnes.")).toBe(false);
  });
  it("préserve un programme sur plusieurs jours tout en retirant la prévision impossible", () => {
    const answer = [
      "## Recommandation IA+",
      "Optimisation des trajets pour 2 voyageurs.",
      "### 2026-12-16 · Centre-ville",
      "### Matin",
      "- Visiter le musée en transports publics",
      "### 2026-12-17 · Visites à pied",
      "### Après-midi",
      "- Parc gratuit",
      "## Budget",
      "| Date | Catégorie | Montant prévu | Détail |",
      "|---|---|---:|---|",
      "| 2026-12-16 | Hôtel | 600 € | 2 personnes |",
      "| 2026-12-17 | Restaurant | 468 € | 2 personnes |",
      "## Alternatives",
      "- Réduire les options payantes.",
    ].join("\n");
    const forecasts = parseAiPlusBudgetForecasts(answer, "2026-12-16", "2026-12-17");
    expect(forecasts.reduce((sum, forecast) => sum + forecast.total, 0)).toBe(1068);
    expect(evaluateAiPlusBudgetWithExisting(forecasts, 500, 0, []).exceeded).toBe(true);
    const fallback = dropUnaffordableAiPlusBudget(answer, "trip");
    expect(splitAiPlusProgramByDay(fallback, "2026-12-16", "2026-12-17")).toHaveLength(2);
    expect(parseAiPlusBudgetForecasts(fallback, "2026-12-16", "2026-12-17")).toHaveLength(0);
    expect(fallback).toContain("pas un séjour financièrement validé");
    expect(fallback).toContain("Les dépenses et prévisions existantes restent inchangées");
    expect(fallback).toContain("## Alternatives");
  });
  it("ne valide pas de nouveau budget si d'autres journées utilisent déjà l'enveloppe", () => {
    const guard = evaluateAiPlusBudgetWithExisting(
      [{ day: "2026-12-16", total: 200, items: [] }],
      500, 0,
      [{ day: "2026-12-15", amount: 400 }],
    );
    expect(guard.reserved).toBe(400);
    expect(guard.exceeded).toBe(true);
  });
});
