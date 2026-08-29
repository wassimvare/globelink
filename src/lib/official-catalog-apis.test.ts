import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchOfficialCatalogRows,
  getOfficialCatalogApiStatusSnapshot,
  OFFICIAL_CATALOG_API_ENV_VARS,
  OFFICIAL_CATALOG_API_VERSION,
} from "./official-catalog-apis.functions";

const API_ENV_NAMES = [
  "GOOGLE_PLACES_API_KEY",
  "GLOBELINK_GOOGLE_PLACES_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "TICKETMASTER_API_KEY",
];

describe("official catalog API connectors", () => {
  beforeEach(() => {
    for (const name of API_ENV_NAMES) delete process.env[name];
  });

  afterEach(() => {
    for (const name of API_ENV_NAMES) delete process.env[name];
  });

  it("documents Google Places and Ticketmaster as the official catalog providers", () => {
    expect(OFFICIAL_CATALOG_API_VERSION).toBe("official-catalog-apis-v2-google-ticketmaster");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.google).toContain("GOOGLE_PLACES_API_KEY");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.ticketmaster).toContain("TICKETMASTER_API_KEY");
  });

  it("reports missing credentials instead of failing silently", () => {
    const status = getOfficialCatalogApiStatusSnapshot();

    expect(status.version).toBe("official-catalog-apis-v2-google-ticketmaster");
    expect(status.anyConfigured).toBe(false);
    expect(status.providers.map((provider) => provider.provider)).toEqual([
      "google",
      "ticketmaster",
    ]);
    expect(status.missingRequiredEnvVars).toEqual(
      expect.arrayContaining(["GOOGLE_PLACES_API_KEY", "TICKETMASTER_API_KEY"]),
    );
  });

  it("does not fail or call providers when no official API key is configured", async () => {
    const rows = await fetchOfficialCatalogRows({
      kinds: ["activity", "hotel", "restaurant"],
      city: "Paris",
      country: "France",
      limit: 20,
    });

    expect(rows).toEqual([]);
  });
});
