import { describe, expect, it } from "vitest";
import { COUNTRY_INFO } from "./country-info";
import { destinationLandmarkTitle, hasCuratedDestinationLandmark } from "./destination-landmarks";
import { WORLD_MAP_HUBS } from "./world-map-hubs";

describe("destination landmark coverage", () => {
  it("uses the requested iconic landmarks for France, the USA and Egypt", () => {
    expect(destinationLandmarkTitle("France")).toBe("Tour Eiffel");
    expect(destinationLandmarkTitle("États-Unis")).toBe("Statue de la Liberté");
    expect(destinationLandmarkTitle("Égypte")).toBe("Pyramides de Gizeh");
  });

  it("covers every country currently listed by GlobeLink", () => {
    const countries = new Set([
      ...COUNTRY_INFO.map((country) => country.name),
      ...WORLD_MAP_HUBS.map((hub) => hub.country),
    ]);
    expect([...countries].filter((country) => !hasCuratedDestinationLandmark(country))).toEqual([]);
  });
});
