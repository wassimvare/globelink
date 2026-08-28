import { describe, expect, it } from "vitest";
import {
  catalogReliabilityReason,
  isReliableCatalogItem,
  trustedDirectCatalogImage,
} from "./catalog-reliability";

const base = {
  kind: "restaurant" as const,
  title: "Chez Globe",
  city: "Lyon",
  country: "France",
  latitude: 45.764,
  longitude: 4.8357,
  image_url: null,
  booking_url: null,
  tags: {},
};

describe("Explorer catalog reliability", () => {
  it("accepts a real OpenStreetMap POI with exact element source", () => {
    expect(
      isReliableCatalogItem({
        ...base,
        provider: "openstreetmap",
        source_url: "https://www.openstreetmap.org/node/123456",
      }),
    ).toBe(true);
  });

  it("rejects an OSM row whose source is an arbitrary website", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        provider: "openstreetmap",
        source_url: "https://example.com/place",
      }),
    ).toBe("source_untrusted");
  });

  it("rejects missing coordinates for a map POI", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        provider: "openstreetmap",
        latitude: null,
        longitude: null,
        source_url: "https://www.openstreetmap.org/node/123456",
      }),
    ).toBe("coordinates_missing");
  });

  it("rejects impossible coordinates", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        provider: "openstreetmap",
        latitude: 120,
        source_url: "https://www.openstreetmap.org/node/123456",
      }),
    ).toBe("coordinates_invalid");
  });

  it("rejects the common 0,0 fallback coordinate", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        provider: "openstreetmap",
        latitude: 0,
        longitude: 0,
        source_url: "https://www.openstreetmap.org/node/123456",
      }),
    ).toBe("coordinates_invalid");
  });

  it("keeps legitimate numeric venue names when the source is verified", () => {
    expect(
      isReliableCatalogItem({
        ...base,
        title: "404",
        provider: "openstreetmap",
        source_url: "https://www.openstreetmap.org/node/247696096",
      }),
    ).toBe(true);
  });

  it("rejects placeholder titles", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        title: "Unknown",
        provider: "openstreetmap",
        source_url: "https://www.openstreetmap.org/node/123456",
      }),
    ).toBe("title_placeholder");
  });

  it("accepts Booking when the concrete Booking source is present", () => {
    expect(
      isReliableCatalogItem({
        ...base,
        kind: "hotel",
        provider: "booking-com",
        source_url: "https://www.booking.com/hotel/fr/example.fr.html",
      }),
    ).toBe(true);
  });

  it("accepts a verified Google Place even when the direct map URL is absent", () => {
    expect(
      isReliableCatalogItem({
        ...base,
        provider: "google-places",
        source_url: "",
        tags: {
          verified_google_place: true,
          google_place_id: "ChIJexample",
        },
      }),
    ).toBe(true);
  });

  it("rejects an unverified search-derived provider", () => {
    expect(
      catalogReliabilityReason({
        ...base,
        provider: "tavily",
        source_url: "https://example.com/article",
      }),
    ).toBe("provider_unverified");
  });

  it("accepts curated activities backed by open knowledge", () => {
    expect(
      isReliableCatalogItem({
        ...base,
        kind: "activity",
        provider: "globelink-curated",
        source_url: "https://www.wikidata.org/wiki/Q243",
        tags: { wikidata: "Q243", curated_country_activity: true },
      }),
    ).toBe(true);
  });

  it("never treats Unsplash as an exact place photo", () => {
    expect(
      trustedDirectCatalogImage(
        {
          ...base,
          provider: "openstreetmap",
          source_url: "https://www.openstreetmap.org/node/123456",
        },
        "https://images.unsplash.com/photo-123",
      ),
    ).toBeNull();
  });

  it("accepts Wikimedia imagery for an OSM-backed place", () => {
    expect(
      trustedDirectCatalogImage(
        {
          ...base,
          provider: "openstreetmap",
          source_url: "https://www.openstreetmap.org/node/123456",
          tags: { wikidata: "Q243" },
        },
        "https://upload.wikimedia.org/wikipedia/commons/a/a1/example.jpg",
      ),
    ).toContain("upload.wikimedia.org");
  });

  it("accepts Booking CDN imagery for Booking inventory", () => {
    expect(
      trustedDirectCatalogImage(
        {
          ...base,
          kind: "hotel",
          provider: "booking-com",
          source_url: "https://www.booking.com/hotel/fr/example.fr.html",
        },
        "https://cf.bstatic.com/xdata/images/hotel/max1024x768/123.jpg",
      ),
    ).toContain("bstatic.com");
  });

  it("rejects arbitrary OSM image tags even if they are HTTPS", () => {
    expect(
      trustedDirectCatalogImage(
        {
          ...base,
          provider: "openstreetmap",
          source_url: "https://www.openstreetmap.org/node/123456",
        },
        "https://random-cdn.example/photo.jpg",
      ),
    ).toBeNull();
  });
});
