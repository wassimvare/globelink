import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchOfficialCatalogRows,
  getOfficialCatalogApiStatusSnapshot,
  OFFICIAL_CATALOG_API_ENV_VARS,
  OFFICIAL_CATALOG_API_VERSION,
} from "./official-catalog-apis.functions";

const API_ENV_NAMES = [
  "BOOKING_API_TOKEN",
  "BOOKING_PARTNER_API_KEY",
  "TRIPADVISOR_API_KEY",
  "GETYOURGUIDE_API_KEY",
  "GETYOURGUIDE_PARTNER_API_KEY",
  "YELP_API_KEY",
];

describe("official catalog API connectors", () => {
  beforeEach(() => {
    for (const name of API_ENV_NAMES) delete process.env[name];
  });

  afterEach(() => {
    for (const name of API_ENV_NAMES) delete process.env[name];
  });

  it("documents the provider API keys used by the catalog", () => {
    expect(OFFICIAL_CATALOG_API_VERSION).toBe("official-catalog-apis-v1");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.booking).toContain("BOOKING_API_TOKEN");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.tripadvisor).toContain("TRIPADVISOR_API_KEY");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.getyourguide).toContain("GETYOURGUIDE_API_KEY");
    expect(OFFICIAL_CATALOG_API_ENV_VARS.restaurants).toContain("YELP_API_KEY");
  });

  it("reports missing credentials instead of failing silently", () => {
    const status = getOfficialCatalogApiStatusSnapshot();

    expect(status.version).toBe("official-catalog-apis-v1");
    expect(status.anyConfigured).toBe(false);
    expect(status.providers.map((provider) => provider.provider)).toEqual([
      "booking",
      "tripadvisor",
      "getyourguide",
      "restaurants",
    ]);
    expect(status.missingRequiredEnvVars).toEqual(
      expect.arrayContaining([
        "BOOKING_API_TOKEN",
        "TRIPADVISOR_API_KEY",
        "GETYOURGUIDE_API_KEY",
        "YELP_API_KEY",
      ]),
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
