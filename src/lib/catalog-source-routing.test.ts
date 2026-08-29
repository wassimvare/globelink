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
  it("routes traceable hotel fallbacks to Google Places verification", () => {
    const item = enrichSpecializedCatalogSource({
      provider: "openstreetmap-live",
      kind: "hotel" as const,
      title: "Ritz Paris",
      city: "Paris",
      country: "France",
      booking_url: "https://www.ritzparis.com/",
      source_url: "https://www.openstreetmap.org/node/1",
      tags: { website: "https://www.ritzparis.com/" },
    });
    const tags = item.tags as Record<string, unknown>;

    expect(item.booking_url).toContain("google.com/maps/search");
    expect(tags.primary_source_label).toBe("Google Places");
    expect(tags.source_is_search_only).toBe(true);
    expect(catalogVerificationReason(item)).toBe("source_non_autorisee");
    expect(isStrictOfficialCatalogItem(item)).toBe(false);
    expect(
      isTrustedVisibleCatalogItem({ ...item, category: "hotel", latitude: 48.86, longitude: 2.34 }),
    ).toBe(true);
    expect(specializedSourceLabel(item)).toBe("Google Places à vérifier");
    expect(specializedReservationLabel(item)).toBe("Vérifier sur Google Places");
  });

  it("accepts Google Places rows for hotels, restaurants and activities when a Google photo exists", () => {
    for (const kind of ["hotel", "restaurant", "activity"] as const) {
      const item = enrichSpecializedCatalogSource({
        provider: "google-places",
        kind,
        title: `Lieu ${kind}`,
        city: "Paris",
        country: "France",
        image_url: null,
        booking_url: "https://www.google.com/maps/search/?api=1&query_place_id=abc",
        source_url: "https://www.google.com/maps/search/?api=1&query_place_id=abc",
        tags: {
          verified_google_place: true,
          google_photo_name: "places/abc/photos/def",
          official_source_verified: true,
          source_is_search_only: false,
          primary_source_label: "Google Places",
        },
      });

      expect(isStrictOfficialCatalogItem(item)).toBe(true);
      expect(isTrustedVisibleCatalogItem(item)).toBe(true);
      expect(catalogVerificationReason(item)).toBe("source_officielle_verifiee");
      expect(specializedSourceLabel(item)).toBe("Google Places");
    }
  });

  it("accepts Ticketmaster events only with a verified event image", () => {
    const event = enrichSpecializedCatalogSource({
      provider: "ticketmaster",
      kind: "activity" as const,
      title: "Concert à Paris",
      category: "event",
      city: "Paris",
      country: "France",
      image_url: "https://s1.ticketm.net/dam/a/event.jpg",
      booking_url: "https://www.ticketmaster.fr/fr/manifestation/concert-billet/idmanif/1",
      source_url: "https://www.ticketmaster.fr/fr/manifestation/concert-billet/idmanif/1",
      tags: {
        official_source_verified: true,
        official_image_url: "https://s1.ticketm.net/dam/a/event.jpg",
        source_is_search_only: false,
        primary_source_label: "Ticketmaster",
      },
    });

    expect(isStrictOfficialCatalogItem(event)).toBe(true);
    expect(isTrustedVisibleCatalogItem(event)).toBe(true);
    expect(specializedSourceLabel(event)).toBe("Ticketmaster");
    expect(catalogVerificationReason({ ...event, image_url: null, tags: { ...event.tags, official_image_url: null } })).toBe(
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
    expect(isTrustedVisibleCatalogItem(blockedAtm)).toBe(false);
  });
});
