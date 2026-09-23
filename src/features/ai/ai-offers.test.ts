import { describe, expect, it } from "vitest";
import { AI_OFFERS, AI_OFFER_ORDER, aiOfferCount } from "./ai-offers";

describe("GlobeLink AI offers", () => {
  it("exposes exactly two user-facing offers", () => {
    expect(aiOfferCount()).toBe(2);
    expect(AI_OFFER_ORDER.map((offer) => offer.id)).toEqual(["free", "plus"]);
  });

  it("keeps free and plus on separate routes", () => {
    expect(AI_OFFERS.free.route).toBe("/ai-trip");
    expect(AI_OFFERS.plus.route).toBe("/ai-pro");
    expect(AI_OFFERS.free.route).not.toBe(AI_OFFERS.plus.route);
  });
});
