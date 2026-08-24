import { describe, expect, it } from "vitest";
import { destinationLabel, humanDateRange, normalizeText, slugifyDestination } from "./phase2";

describe("Phase 2 helpers", () => {
  it("slugifie les destinations avec accents", () => {
    expect(slugifyDestination("Émirats Arabes Unis")).toBe("emirats-arabes-unis");
    expect(slugifyDestination("Île Maurice")).toBe("ile-maurice");
  });

  it("normalise les textes pour les correspondances", () => {
    expect(normalizeText("  Côte d'Azur  ")).toBe("cote d'azur");
  });

  it("compose un libellé de destination sans donnée inventée", () => {
    expect(destinationLabel("Lyon", "France")).toBe("Lyon, France");
    expect(destinationLabel(null, null)).toBe("Destination à définir");
  });

  it("formate une plage de dates", () => {
    expect(humanDateRange(null, null)).toBe("Dates à définir");
    expect(humanDateRange("2026-08-18", "2026-08-22")).toContain("→");
  });
});
