import { describe, expect, it } from "vitest";
import {
  classifyTravelSource,
  priceSearchCategories,
  travelSourcePromptLabel,
  type TravelPriceSource,
} from "./travel-price-sources.server";

describe("IA+ — hiérarchie des sources de prix", () => {
  it("autorise Booking.com pour les prix d'hôtel uniquement", () => {
    expect(classifyTravelSource("https://www.booking.com/hotel/fr/example.fr.html", "hotel", "booking")).toEqual({
      authority: "booking",
      priceUsable: true,
    });
    expect(classifyTravelSource("https://www.booking.com/attractions/example", "activity", "booking")).toEqual({
      authority: "booking",
      priceUsable: false,
    });
  });

  it("autorise GetYourGuide pour les prix d'activité uniquement", () => {
    expect(classifyTravelSource("https://www.getyourguide.com/paris-l16/example", "activity", "getyourguide")).toEqual({
      authority: "getyourguide",
      priceUsable: true,
    });
    expect(classifyTravelSource("https://www.getyourguide.com/paris-l16/example", "restaurant", "getyourguide")).toEqual({
      authority: "getyourguide",
      priceUsable: false,
    });
  });

  it("refuse les agrégateurs secondaires comme source de prix officielle", () => {
    expect(classifyTravelSource("https://www.tripadvisor.fr/Restaurant_Review-example", "restaurant", "official_candidate")).toEqual({
      authority: "fallback",
      priceUsable: false,
    });
    expect(classifyTravelSource("https://www.thefork.fr/restaurant/example", "restaurant", "official_candidate")).toEqual({
      authority: "fallback",
      priceUsable: false,
    });
  });

  it("cherche toutes les catégories pour un vrai programme de voyage", () => {
    expect(priceSearchCategories({ query: "Fais-moi un programme pour mon voyage", mode: "plan" })).toEqual([
      "hotel",
      "activity",
      "restaurant",
      "transport",
    ]);
  });

  it("ne cherche que l'hôtel quand la demande est ciblée", () => {
    expect(priceSearchCategories({ query: "Compare-moi des hôtels à Genève", mode: "research" })).toEqual([
      "hotel",
    ]);
  });

  it("indique clairement si une source peut servir pour un prix", () => {
    const source: TravelPriceSource = {
      title: "Example",
      url: "https://www.booking.com/hotel/fr/example.fr.html",
      snippet: "Tarif affiché",
      category: "hotel",
      authority: "booking",
      priceUsable: true,
    };
    expect(travelSourcePromptLabel(source)).toContain("BOOKING.COM");
    expect(travelSourcePromptLabel(source)).toContain("PRIX UTILISABLE");
  });
});
