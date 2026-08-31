import { describe, expect, it } from "vitest";
import {
  classifyTravelSource,
  hasExplicitPriceEvidence,
  mergeTravelPriceSources,
  priceSearchCategories,
  travelSourcePromptLabel,
  type TravelPriceSource,
} from "./travel-price-sources.server";
import {
  buildHotelStay,
  mergeVerifiedHotelSources,
  parseBookingHotelSource,
  selectBalancedHotelSources,
} from "./verified-hotel-sources.server";

describe("IA+ — hiérarchie des sources de prix", () => {
  it("autorise Booking.com pour les prix d'hôtel uniquement", () => {
    expect(
      classifyTravelSource("https://www.booking.com/hotel/fr/example.fr.html", "hotel", "booking"),
    ).toEqual({
      authority: "booking",
      priceUsable: true,
    });
    expect(
      classifyTravelSource("https://www.booking.com/attractions/example", "activity", "booking"),
    ).toEqual({
      authority: "booking",
      priceUsable: false,
    });
  });

  it("autorise GetYourGuide pour les prix d'activité uniquement", () => {
    expect(
      classifyTravelSource(
        "https://www.getyourguide.com/paris-l16/example",
        "activity",
        "getyourguide",
      ),
    ).toEqual({
      authority: "getyourguide",
      priceUsable: true,
    });
    expect(
      classifyTravelSource(
        "https://www.getyourguide.com/paris-l16/example",
        "restaurant",
        "getyourguide",
      ),
    ).toEqual({
      authority: "getyourguide",
      priceUsable: false,
    });
  });

  it("refuse les agrégateurs secondaires comme source de prix officielle", () => {
    expect(
      classifyTravelSource(
        "https://www.tripadvisor.fr/Restaurant_Review-example",
        "restaurant",
        "official_candidate",
      ),
    ).toEqual({
      authority: "fallback",
      priceUsable: false,
    });
    expect(
      classifyTravelSource(
        "https://www.thefork.fr/restaurant/example",
        "restaurant",
        "official_candidate",
      ),
    ).toEqual({
      authority: "fallback",
      priceUsable: false,
    });
  });

  it("ne considère pas un domaine arbitraire comme une preuve de prix officielle", () => {
    expect(
      classifyTravelSource(
        "https://blog-voyage.example/hotels-paris",
        "hotel",
        "official_candidate",
      ),
    ).toEqual({ authority: "official_candidate", priceUsable: false });
  });

  it("exige un montant accompagné d'une devise dans un extrait web", () => {
    expect(hasExplicitPriceEvidence("Disponible du 12 au 15 septembre, note 8,7/10")).toBe(false);
    expect(hasExplicitPriceEvidence("Tarif affiché : 184,50 EUR pour le séjour")).toBe(true);
    expect(hasExplicitPriceEvidence("À partir de CHF 129 par nuit")).toBe(true);
  });

  it("cherche toutes les catégories pour un vrai programme de voyage", () => {
    expect(
      priceSearchCategories({ query: "Fais-moi un programme pour mon voyage", mode: "plan" }),
    ).toEqual(["hotel", "activity", "restaurant", "transport"]);
  });

  it("ne cherche que l'hôtel quand la demande est ciblée", () => {
    expect(
      priceSearchCategories({ query: "Compare-moi des hôtels à Genève", mode: "research" }),
    ).toEqual(["hotel"]);
  });

  it("distingue un prix web observé d'un vrai tarif daté Booking API", () => {
    const source: TravelPriceSource = {
      title: "Example",
      url: "https://www.booking.com/hotel/fr/example.fr.html",
      snippet: "Tarif affiché",
      category: "hotel",
      authority: "booking",
      priceUsable: true,
    };
    expect(travelSourcePromptLabel(source)).toContain("BOOKING.COM");
    expect(travelSourcePromptLabel(source)).toContain("À CONFIRMER");

    expect(
      travelSourcePromptLabel({
        ...source,
        authority: "booking_api",
      }),
    ).toContain("PRIX UTILISABLE POUR LES DATES");
  });

  it("place toujours une offre Booking API datée avant un extrait web", () => {
    const web: TravelPriceSource = {
      title: "Hôtel Exemple",
      url: "https://www.booking.com/hotel/fr/example.fr.html",
      snippet: "120 EUR",
      category: "hotel",
      authority: "booking",
      priceUsable: true,
    };
    const live: TravelPriceSource = {
      ...web,
      url: "https://www.booking.com/hotel/fr/example-live.fr.html",
      authority: "booking_api",
      hotel: {
        name: "Hôtel Exemple",
        livePrice: true,
        checkin: "2026-09-10",
        checkout: "2026-09-13",
        nights: 3,
        travelers: 2,
        rooms: 1,
        occupancyAssumed: true,
        totalPrice: 360,
        pricePerNight: 120,
        currency: "EUR",
        rating: 8.8,
        reviewsCount: 600,
        stars: 4,
        checkedAt: "2026-08-31T20:00:00.000Z",
      },
    };
    expect(mergeTravelPriceSources([web, live])).toEqual([live]);
  });
});

describe("IA+ — hôtels et occupation datés", () => {
  it("déduit prudemment le nombre de chambres et respecte une demande explicite", () => {
    const assumed = buildHotelStay(
      {
        startsOn: "2026-09-10",
        endsOn: "2026-09-13",
        travelers: 5,
        query: "Trouve de bons hôtels",
      },
      new Date("2026-08-31T20:00:00.000Z"),
    );
    expect(assumed).toMatchObject({ nights: 3, travelers: 5, rooms: 3, occupancyAssumed: true });

    const explicit = buildHotelStay(
      {
        startsOn: "2026-09-10",
        endsOn: "2026-09-13",
        travelers: 5,
        query: "Je veux exactement 2 chambres",
      },
      new Date("2026-08-31T20:00:00.000Z"),
    );
    expect(explicit).toMatchObject({ rooms: 2, occupancyAssumed: false });
  });

  it("refuse de présenter une recherche passée comme une disponibilité actuelle", () => {
    expect(
      buildHotelStay(
        {
          startsOn: "2026-08-20",
          endsOn: "2026-08-23",
          travelers: 2,
          query: "hôtel",
        },
        new Date("2026-08-31T20:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("calcule le total du séjour et le prix par nuit sans multiplier les voyageurs", () => {
    const stay = buildHotelStay(
      {
        startsOn: "2026-09-10",
        endsOn: "2026-09-13",
        travelers: 4,
        query: "2 chambres",
      },
      new Date("2026-08-31T20:00:00.000Z"),
    );
    expect(stay).not.toBeNull();
    const source = parseBookingHotelSource(
      {
        stay: stay!,
        checkedAt: "2026-08-31T20:00:00.000Z",
        searchRow: {
          id: 42,
          currency: { booker: "EUR" },
          price: { total: { booker_currency: 480 } },
          url: "https://www.booking.com/hotel/fr/exact.fr.html",
        },
        detailsRow: {
          id: 42,
          name: { fr: "Hôtel Exact" },
          rating: { review_score: 8.7, number_of_reviews: 421, stars: 4 },
        },
      },
      { query: "hôtel", city: "Lyon", country: "France" },
    );
    expect(source?.priceUsable).toBe(true);
    expect(source?.hotel).toMatchObject({
      name: "Hôtel Exact",
      totalPrice: 480,
      pricePerNight: 160,
      travelers: 4,
      rooms: 2,
      nights: 3,
      rating: 8.7,
      reviewsCount: 421,
    });
    expect(source?.snippet).toContain("480,00 € total du séjour");
  });

  it("garde la source Booking datée lorsqu'un même hôtel existe aussi dans Google", () => {
    const commonHotel = {
      name: "Hôtel Lumière",
      livePrice: false,
      checkin: "2026-09-10",
      checkout: "2026-09-12",
      nights: 2,
      travelers: 2,
      rooms: 1,
      occupancyAssumed: true,
      totalPrice: null,
      pricePerNight: null,
      currency: null,
      rating: 4.6,
      reviewsCount: 300,
      stars: null,
      checkedAt: null,
    };
    const google: TravelPriceSource = {
      title: "Hotel Lumiere",
      url: "https://maps.google.com/example",
      snippet: "Établissement vérifié",
      category: "hotel",
      authority: "google_places",
      priceUsable: false,
      hotel: { ...commonHotel, name: "Hotel Lumiere" },
    };
    const booking: TravelPriceSource = {
      title: "Hôtel Lumière",
      url: "https://www.booking.com/hotel/fr/lumiere.fr.html",
      snippet: "Tarif daté",
      category: "hotel",
      authority: "booking_api",
      priceUsable: true,
      hotel: {
        ...commonHotel,
        livePrice: true,
        totalPrice: 300,
        pricePerNight: 150,
        currency: "EUR",
        rating: 8.9,
        checkedAt: "2026-08-31T20:00:00.000Z",
      },
    };
    expect(mergeVerifiedHotelSources([google, booking])).toEqual([booking]);
  });

  it("conserve des options bien notées, économiques et au bon rapport note-prix", () => {
    const hotel = (name: string, rating: number, pricePerNight: number): TravelPriceSource => ({
      title: name,
      url: `https://www.booking.com/hotel/fr/${name.toLowerCase()}.fr.html`,
      snippet: "Tarif daté",
      category: "hotel",
      authority: "booking_api",
      priceUsable: true,
      hotel: {
        name,
        livePrice: true,
        checkin: "2026-09-10",
        checkout: "2026-09-12",
        nights: 2,
        travelers: 2,
        rooms: 1,
        occupancyAssumed: true,
        totalPrice: pricePerNight * 2,
        pricePerNight,
        currency: "EUR",
        rating,
        reviewsCount: 500,
        stars: 4,
        checkedAt: "2026-08-31T20:00:00.000Z",
      },
    });
    const sources = [
      hotel("Top", 9.6, 360),
      hotel("Valeur", 9.0, 120),
      hotel("Économique", 8.0, 70),
      hotel("Intermédiaire", 8.8, 180),
    ];
    const selected = selectBalancedHotelSources(sources, 3).map((source) => source.title);
    expect(selected).toContain("Top");
    expect(selected).toContain("Économique");
    expect(selected).toContain("Valeur");
  });
});
