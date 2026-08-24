import { describe, expect, it } from "vitest";
import {
  catalogVerificationReason,
  enrichSpecializedCatalogSource,
  isStrictOfficialCatalogItem,
  isTrustedVisibleCatalogItem,
  specializedReservationLabel,
  specializedSourceLabel,
} from "./catalog-source-routing";

describe("specialized catalog source routing", () => {
  it("routes hotels to Booking.com while preserving the original place proof", () => {
    const item = enrichSpecializedCatalogSource({
      kind: "hotel" as const,
      title: "Ritz Paris",
      city: "Paris",
      country: "France",
      booking_url: "https://www.ritzparis.com/",
      source_url: "https://www.openstreetmap.org/node/1",
      tags: { website: "https://www.ritzparis.com/" },
    });
    const tags = item.tags as Record<string, unknown>;

    expect(item.booking_url).toContain("booking.com");
    expect(item.source_url).toBe("https://www.openstreetmap.org/node/1");
    expect(tags.primary_source_label).toBe("Booking.com");
    expect(tags.official_website).toBe("https://www.ritzparis.com/");
    expect(tags.source_is_search_only).toBe(true);
    expect(tags.official_source_verified).toBe(false);
    expect(catalogVerificationReason(item)).toBe("lien_de_recherche_non_verifie");
    expect(isStrictOfficialCatalogItem(item)).toBe(false);
    expect(
      isTrustedVisibleCatalogItem({ ...item, category: "hotel", latitude: 48.86, longitude: 2.34 }),
    ).toBe(true);
    expect(specializedSourceLabel(item)).toBe("Booking.com à vérifier");
    expect(specializedReservationLabel(item)).toBe("Vérifier sur Booking.com");
  });

  it("routes restaurants to restaurant-only discovery sources", () => {
    const item = enrichSpecializedCatalogSource({
      kind: "restaurant" as const,
      title: "Le Jules Verne",
      city: "Paris",
      country: "France",
      booking_url: null,
      source_url: "https://www.openstreetmap.org/way/2",
      tags: {},
    });
    const tags = item.tags as Record<string, unknown>;

    expect(item.booking_url).toContain("google.com/maps/search");
    expect(tags.primary_source_label).toBe("Google Maps");
    expect(JSON.stringify(tags.secondary_sources)).toContain("Uber Eats");
    expect(JSON.stringify(tags.secondary_sources)).toContain("Tripadvisor restaurants");
    expect(tags.source_is_search_only).toBe(true);
    expect(catalogVerificationReason(item)).toBe("lien_de_recherche_non_verifie");
    expect(
      isTrustedVisibleCatalogItem({
        ...item,
        category: "restaurant",
        latitude: 48.86,
        longitude: 2.34,
      }),
    ).toBe(true);
    expect(specializedReservationLabel(item)).toBe("Vérifier sur Google Maps");
  });

  it("routes activities to GetYourGuide and keeps Tripadvisor as a second source", () => {
    const item = enrichSpecializedCatalogSource({
      kind: "activity" as const,
      title: "Tour Eiffel",
      city: "Paris",
      country: "France",
      booking_url: null,
      source_url: "https://fr.wikipedia.org/wiki/Tour_Eiffel",
      tags: {
        wikipedia: "fr:Tour Eiffel",
        google_photo_attributions: [{ displayName: "Google contributor", uri: null }],
      },
    });
    const tags = item.tags as Record<string, unknown>;

    expect(item.booking_url).toContain("getyourguide.fr/s/");
    expect(item.source_url).toBe("https://fr.wikipedia.org/wiki/Tour_Eiffel");
    expect(tags.primary_source_label).toBe("GetYourGuide");
    expect(JSON.stringify(tags.secondary_sources)).toContain("Tripadvisor activités");
    expect(JSON.stringify(tags.photo_source_priority)).toContain("google-places");
    expect(JSON.stringify(tags.google_photo_attributions)).toContain("Google contributor");
    expect(isStrictOfficialCatalogItem(item)).toBe(false);
    expect(isTrustedVisibleCatalogItem({ ...item, latitude: 48.8584, longitude: 2.2945 })).toBe(
      true,
    );
  });

  it("accepts official provider rows only when the provider and photo are verified", () => {
    const bookingHotel = enrichSpecializedCatalogSource({
      provider: "booking-com",
      kind: "hotel" as const,
      title: "Ritz Paris",
      city: "Paris",
      country: "France",
      image_url: "https://cf.bstatic.com/xdata/images/hotel/max1600/ritz.jpg",
      booking_url: "https://www.booking.com/hotel/fr/ritz-paris.fr.html",
      source_url: "https://www.booking.com/hotel/fr/ritz-paris.fr.html",
      tags: { official_source_verified: true },
    });
    const googleRestaurant = enrichSpecializedCatalogSource({
      provider: "google-places",
      kind: "restaurant" as const,
      title: "Le Jules Verne",
      city: "Paris",
      country: "France",
      image_url: null,
      booking_url: "https://www.google.com/maps/search/?api=1&query_place_id=abc",
      source_url: "https://www.google.com/maps/search/?api=1&query_place_id=abc",
      tags: {
        verified_google_place: true,
        google_photo_name: "places/abc/photos/def",
      },
    });
    const getYourGuideActivity = enrichSpecializedCatalogSource({
      provider: "getyourguide",
      kind: "activity" as const,
      title: "Visite guidée de la Tour Eiffel",
      city: "Paris",
      country: "France",
      image_url: "https://cdn.getyourguide.com/img/tour-eiffel.jpg",
      booking_url: "https://www.getyourguide.fr/paris-l16/visite-tour-eiffel-t1/",
      source_url: "https://www.getyourguide.fr/paris-l16/visite-tour-eiffel-t1/",
      tags: { official_source_verified: true },
    });

    expect(isStrictOfficialCatalogItem(bookingHotel)).toBe(true);
    expect(isStrictOfficialCatalogItem(googleRestaurant)).toBe(true);
    expect(isStrictOfficialCatalogItem(getYourGuideActivity)).toBe(true);
    expect(isTrustedVisibleCatalogItem(bookingHotel)).toBe(true);
    expect(isTrustedVisibleCatalogItem(googleRestaurant)).toBe(true);
    expect(isTrustedVisibleCatalogItem(getYourGuideActivity)).toBe(true);
    expect(catalogVerificationReason({ ...getYourGuideActivity, image_url: null })).toBe(
      "photo_officielle_manquante",
    );
  });

  it("keeps traceable visible fallbacks without allowing utility categories", () => {
    const visibleMuseum = enrichSpecializedCatalogSource({
      provider: "openstreetmap-live",
      kind: "activity" as const,
      title: "Musée national",
      category: "musee",
      source_url: "https://www.openstreetmap.org/node/12",
      latitude: 48.86,
      longitude: 2.34,
      tags: { tourism: "museum" },
    });
    const visibleRestaurant = enrichSpecializedCatalogSource({
      provider: "openstreetmap-browser",
      kind: "restaurant" as const,
      title: "Restaurant du Centre",
      category: "restaurant",
      source_url: "https://www.openstreetmap.org/node/13",
      latitude: 48.86,
      longitude: 2.34,
      tags: { amenity: "restaurant" },
    });
    const blockedBar = enrichSpecializedCatalogSource({
      provider: "openstreetmap-live",
      kind: "activity" as const,
      title: "Bar du Port",
      category: "bar",
      source_url: "https://www.openstreetmap.org/node/14",
      latitude: 48.86,
      longitude: 2.34,
      tags: { amenity: "bar" },
    });
    const blockedAtm = enrichSpecializedCatalogSource({
      provider: "openstreetmap-live",
      kind: "activity" as const,
      title: "Distributeur",
      category: "distributeur",
      source_url: "https://www.openstreetmap.org/node/15",
      latitude: 48.86,
      longitude: 2.34,
      tags: { amenity: "atm" },
    });

    expect(isTrustedVisibleCatalogItem(visibleMuseum)).toBe(true);
    expect(isTrustedVisibleCatalogItem(visibleRestaurant)).toBe(true);
    expect(isTrustedVisibleCatalogItem(blockedBar)).toBe(false);
    expect(isTrustedVisibleCatalogItem(blockedAtm)).toBe(false);
  });
});
