import { describe, expect, it } from "vitest";
import { destinationLandmarkTitle } from "./destination-landmarks";
import { WORLD_MAP_HUBS } from "./world-map-hubs";
import {
  ALL_CURATED_WORLD_ACTIVITIES,
  CURATED_ACTIVITY_COUNTRIES,
  curatedActivityBySlug,
  curatedActivitiesForCountry,
  dailyWorldActivitySelection,
  representativeWorldActivities,
} from "./world-activities";

describe("world activities coverage", () => {
  const mapCountries = Array.from(new Set(WORLD_MAP_HUBS.map((hub) => hub.country)));

  it("provides three real activity fallbacks for every country on the world map", () => {
    expect(CURATED_ACTIVITY_COUNTRIES).toHaveLength(mapCountries.length);
    for (const country of mapCountries) {
      const activities = curatedActivitiesForCountry(country);
      expect(activities, country).toHaveLength(3);
      expect(activities[0]?.title, country).toBe(destinationLandmarkTitle(country));
      for (const activity of activities) {
        expect(activity.country).toBe(country);
        expect(activity.kind).toBe("activity");
        expect(activity.provider).toBe("globelink-curated");
        expect(activity.source_url).toMatch(/^https:\/\/fr\.wikipedia\.org\/wiki\//);
        expect(activity.booking_url).toContain("google.com/maps/search");
        expect(activity.tags?.wikipedia).toMatch(/^fr:/);
        expect(activity.tags?.primary_source_label).toBe("Google Places");
      }
    }
  });

  it("keeps every curated activity addressable by a unique slug", () => {
    const slugs = ALL_CURATED_WORLD_ACTIVITIES.map((activity) => activity.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(ALL_CURATED_WORLD_ACTIVITIES).toHaveLength(mapCountries.length * 3);
  });

  it.each([
    ["opera-de-sydney-gl-australie", "Sydney", "Australie"],
    ["christ-redempteur-gl-bresil", "Rio de Janeiro", "Brésil"],
    ["chutes-du-niagara-gl-canada", "Niagara Falls", "Canada"],
    ["machu-picchu-gl-perou", "District de Machupicchu", "Pérou"],
    ["teotihuacan-gl-mexique", "San Juan Teotihuacán", "Mexique"],
    ["mont-fuji-gl-japon", null, "Japon"],
    ["uluru-gl-australie", null, "Australie"],
  ])("uses the activity's own location for %s", (slug, city, country) => {
    const activity = curatedActivityBySlug(slug)!;
    const location = city ? `${city}, ${country}` : country;

    expect(activity).toMatchObject({ city, country });
    expect(activity.description).toContain(`· ${location}.`);
    expect(new URL(activity.booking_url!).searchParams.get("query")).toBe(
      `${activity.title}, ${location}`,
    );
  });

  it("builds a diverse world selection with one country per card", () => {
    expect(representativeWorldActivities()).toHaveLength(mapCountries.length);
    const selection = dailyWorldActivitySelection(24, new Date("2026-08-18T00:00:00.000Z"));
    expect(selection).toHaveLength(24);
    expect(new Set(selection.map((activity) => activity.country)).size).toBe(24);
  });
});
