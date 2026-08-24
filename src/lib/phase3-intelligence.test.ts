import { describe, expect, it } from "vitest";
import {
  calculatePhase3Compatibility,
  overlapDays,
  weatherCodeLabel,
} from "@/lib/phase3-intelligence";

describe("Phase 3 intelligence", () => {
  it("calcule les jours de voyage en commun", () => {
    expect(overlapDays("2026-08-18", "2026-08-24", "2026-08-21", "2026-08-27")).toBe(4);
    expect(overlapDays("2026-08-01", "2026-08-05", "2026-08-10", "2026-08-12")).toBe(0);
  });

  it("donne un score élevé à deux voyageurs réellement compatibles", () => {
    const result = calculatePhase3Compatibility(
      {
        city: "Bali",
        country: "Indonésie",
        startsOn: "2026-08-18",
        endsOn: "2026-08-24",
        budgetEur: 1200,
        languages: ["Français", "Anglais"],
        interests: ["Plongée", "Randonnée", "Photo"],
        age: 27,
      },
      {
        destination: "Bali, Indonésie",
        startsOn: "2026-08-20",
        endsOn: "2026-08-25",
        budgetEur: 1300,
        languages: ["Français"],
        interests: ["Plongée", "Photo"],
        ageMin: 20,
        ageMax: 35,
      },
    );

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.overlapDays).toBe(5);
    expect(result.sharedInterests).toEqual(["Plongée", "Photo"]);
    expect(result.reasons.join(" ")).toContain("Même destination");
  });

  it("ne surévalue pas un profil sans destination ni dates communes", () => {
    const result = calculatePhase3Compatibility(
      {
        city: "Tokyo",
        country: "Japon",
        startsOn: "2026-10-01",
        endsOn: "2026-10-05",
        budgetEur: 3000,
        languages: ["Japonais"],
        interests: ["Musées"],
        age: 55,
      },
      {
        destination: "Bali, Indonésie",
        startsOn: "2026-08-20",
        endsOn: "2026-08-25",
        budgetEur: 800,
        languages: ["Français"],
        interests: ["Plongée"],
        ageMin: 20,
        ageMax: 35,
      },
    );

    expect(result.score).toBeLessThanOrEqual(10);
  });

  it("traduit les principaux codes météo Open-Meteo", () => {
    expect(weatherCodeLabel(0)).toBe("Ciel dégagé");
    expect(weatherCodeLabel(63)).toBe("Pluie");
    expect(weatherCodeLabel(95)).toBe("Orages");
  });
});
