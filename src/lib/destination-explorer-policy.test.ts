import { describe, expect, it } from "vitest";
import {
  destinationMissingKinds,
  destinationViewportBounds,
  resolveDestinationHub,
} from "./destination-explorer-policy";

const representativeDestinations = [
  ["Paris", "France"],
  ["Genève", "Suisse"],
  ["Londres", "Royaume-Uni"],
  ["Rome", "Italie"],
  ["Madrid", "Espagne"],
  ["Tunis", "Tunisie"],
  ["Marrakech", "Maroc"],
  ["Le Caire", "Égypte"],
  ["Dubaï", "Émirats arabes unis"],
  ["Istanbul", "Turquie"],
  ["Jakarta", "Indonésie"],
  ["Bali", "Indonésie"],
  ["Bangkok", "Thaïlande"],
  ["Tokyo", "Japon"],
  ["Séoul", "Corée du Sud"],
  ["Singapour", "Singapour"],
  ["Sydney", "Australie"],
  ["San Francisco", "États-Unis"],
  ["Vancouver", "Canada"],
  ["Buenos Aires", "Argentine"],
] as const;

describe("Explorer destination policy", () => {
  it.each(representativeDestinations)(
    "resolves the exact hub for %s, %s",
    (city, country) => {
      const hub = resolveDestinationHub({ city, country });
      expect(hub?.city).toBe(city);
      expect(hub?.country).toBe(country);
      expect(Number.isFinite(hub?.lat)).toBe(true);
      expect(Number.isFinite(hub?.lng)).toBe(true);
    },
  );

  it("never falls back to an unrelated city when a specific city is unknown", () => {
    expect(resolveDestinationHub({ city: "Banff", country: "Canada" })).toBeNull();
  });

  it("uses a country hub only for country-level destinations", () => {
    const hub = resolveDestinationHub({ city: null, country: "Canada" });
    expect(hub?.country).toBe("Canada");
    expect(hub?.city).toBe("Vancouver");
  });

  it("uses a wider viewport for regional destinations such as Bali", () => {
    const bali = resolveDestinationHub({ city: "Bali", country: "Indonésie" });
    const bounds = destinationViewportBounds(bali?.lat, bali?.lng, bali?.zoom);
    expect(bounds).not.toBeNull();
    expect((bounds!.north - bounds!.south)).toBeGreaterThan(0.5);
    expect((bounds!.east - bounds!.west)).toBeGreaterThan(0.8);
  });

  it("keeps normal city viewports focused", () => {
    const paris = resolveDestinationHub({ city: "Paris", country: "France" });
    const bounds = destinationViewportBounds(paris?.lat, paris?.lng, paris?.zoom);
    expect(bounds?.zoom).toBe(14);
    expect((bounds!.north - bounds!.south)).toBeLessThan(0.2);
  });

  it("requests only catalog categories that are still underfilled", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ kind: "activity" })),
      ...Array.from({ length: 2 }, () => ({ kind: "restaurant" })),
      ...Array.from({ length: 3 }, () => ({ kind: "hotel" })),
    ];
    expect(destinationMissingKinds(rows)).toEqual(["restaurant"]);
  });
});
