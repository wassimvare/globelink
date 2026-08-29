import { describe, expect, it } from "vitest";
import {
  catalogItemPassesPhase5,
  catalogItemsDescribeSamePlace,
  dedupeVerifiedCatalogItems,
  sanitizeCatalogItem,
} from "./catalog-quality";

const googleRestaurant = {
  id: "google-1",
  provider: "google-places",
  external_id: "place-1",
  kind: "restaurant" as const,
  title: "Le Comptoir Lyonnais",
  city: "Lyon",
  country: "France",
  latitude: 45.764,
  longitude: 4.8357,
  image_url: null,
  source_url: "https://www.google.com/maps/place/?q=place_id:place-1",
  booking_url: "https://example-restaurant.fr",
  valid_until: null,
  tags: {
    verified_google_place: true,
    google_place_id: "place-1",
    google_photo_name: "places/place-1/photos/photo-1",
    official_source_verified: true,
    strict_official_source_verified: true,
  },
};

describe("Phase 5 catalog quality", () => {
  it("keeps a verified, geolocated official place", () => {
    expect(catalogItemPassesPhase5(googleRestaurant)).toBe(true);
  });

  it("rejects expired persisted inventory", () => {
    expect(
      catalogItemPassesPhase5({ ...googleRestaurant, valid_until: "2020-01-01T00:00:00.000Z" }, Date.parse("2026-01-01T00:00:00.000Z")),
    ).toBe(false);
  });

  it("detects the same place across providers when name and coordinates match", () => {
    const osm = {
      ...googleRestaurant,
      id: "osm-1",
      provider: "openstreetmap",
      external_id: "123",
      title: "Le Comptoir Lyonnais",
      latitude: 45.76405,
      longitude: 4.83575,
      source_url: "https://www.openstreetmap.org/node/123",
      tags: {},
    };
    expect(catalogItemsDescribeSamePlace(googleRestaurant, osm)).toBe(true);
  });

  it("prefers the stronger official provider when two sources describe the same place", () => {
    const osm = {
      ...googleRestaurant,
      id: "osm-1",
      provider: "openstreetmap",
      external_id: "123",
      source_url: "https://www.openstreetmap.org/node/123",
      booking_url: null,
      tags: {},
    };
    const rows = dedupeVerifiedCatalogItems([osm, googleRestaurant]);
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("google-places");
  });

  it("does not merge two same-named places that are far apart", () => {
    const paris = { ...googleRestaurant, id: "paris", city: "Paris", latitude: 48.8566, longitude: 2.3522 };
    expect(catalogItemsDescribeSamePlace(googleRestaurant, paris)).toBe(false);
  });

  it("removes a generic stock image instead of presenting it as the place", () => {
    const cleaned = sanitizeCatalogItem({
      ...googleRestaurant,
      image_url: "https://images.unsplash.com/photo-123",
      tags: { verified_google_place: true, google_place_id: "place-1" },
    });
    expect(cleaned.image_url).toBeNull();
  });

  it("keeps a verified provider image", () => {
    const bookingHotel = {
      ...googleRestaurant,
      provider: "booking-com",
      kind: "hotel" as const,
      title: "Hotel Globe",
      source_url: "https://www.booking.com/hotel/fr/globe.fr.html",
      booking_url: "https://www.booking.com/hotel/fr/globe.fr.html",
      image_url: "https://cf.bstatic.com/xdata/images/hotel/max1024x768/123.jpg",
      tags: {},
    };
    expect(sanitizeCatalogItem(bookingHotel).image_url).toContain("bstatic.com");
  });
});
