import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  compatibilitySignals,
  daysOverlap,
  matchQuality,
  scoreTraveler,
  suggestedMeetups,
  type MapTraveler,
} from "./travel-match";

const traveler: MapTraveler = {
  id: "traveler-1",
  name: "Nora",
  avatar: null,
  lat: 0,
  lng: 0,
  city: "Bali",
  country: "Indonésie",
  starts_on: "2026-10-10",
  ends_on: "2026-10-17",
  budget_eur: 1200,
  languages: ["Français", "Anglais"],
  interests: ["Plongée", "Nature", "Café"],
  bio: "Voyageuse",
  age: 27,
};

describe("Travel Match compatibility", () => {
  it("calcule le chevauchement inclusif des dates", () => {
    expect(daysOverlap("2026-10-10", "2026-10-15", "2026-10-14", "2026-10-20")).toBe(2);
    expect(daysOverlap("2026-10-10", "2026-10-12", "2026-10-13", "2026-10-20")).toBe(0);
  });

  it("explique un profil compatible avec les données réellement connues", () => {
    const result = scoreTraveler(traveler, {
      ...DEFAULT_PREFS,
      destination: "Bali, Indonésie",
      budget: 1100,
      startsOn: "2026-10-12",
      endsOn: "2026-10-16",
      languages: ["Français"],
      interests: ["Plongée", "Nature"],
      ageMin: 20,
      ageMax: 35,
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.overlap).toBe(5);
    expect(result.sharedLangs).toEqual(["Français"]);
    expect(result.sharedInts).toEqual(["Plongée", "Nature"]);
    expect(result.parts.find((part) => part.label === "Destination")?.got).toBe(30);
    expect(matchQuality(result.score, result.parts)).toMatch(/Excellent match|Très compatible/);
    expect(
      compatibilitySignals({
        overlap: result.overlap,
        sharedInts: result.sharedInts,
        sharedLangs: result.sharedLangs,
      }),
    ).toContain("5 jours de voyage en commun");
  });

  it("ne pénalise pas une information absente dans le dénominateur", () => {
    const result = scoreTraveler(
      { ...traveler, budget_eur: null, age: null },
      {
        ...DEFAULT_PREFS,
        destination: "Indonésie",
        startsOn: "2026-10-12",
        endsOn: "2026-10-16",
        languages: ["Français"],
        interests: ["Plongée"],
      },
    );

    expect(result.parts.find((part) => part.label === "Budget")?.max).toBe(0);
    expect(result.parts.find((part) => part.label === "Âge")?.max).toBe(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("signale un voyage différent quand destination ou dates sont incompatibles", () => {
    const result = scoreTraveler(traveler, {
      ...DEFAULT_PREFS,
      destination: "Tokyo, Japon",
      startsOn: "2026-11-01",
      endsOn: "2026-11-05",
    });

    expect(matchQuality(result.score, result.parts)).toBe("Voyage différent");
  });
});

describe("Travel Match meetup intents", () => {
  it("propose exactement les trois invitations prévues", () => {
    const intents = suggestedMeetups(traveler, ["Plongée"]);
    expect(intents.map((intent) => intent.label)).toEqual([
      "Faire une activité ensemble",
      "Prendre un café",
      "Explorer ensemble",
    ]);
    expect(intents[0].draft).toContain("Plongée");
    expect(intents.every((intent) => intent.draft.includes("Nora"))).toBe(true);
  });
});
