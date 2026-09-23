export const AI_OFFERS = {
  free: {
    id: "free",
    label: "Gratuit",
    productName: "GlobeLink IA",
    route: "/ai-trip" as const,
    role: "Inspiration et conseils simples",
  },
  plus: {
    id: "plus",
    label: "IA+",
    productName: "GlobeLink IA+",
    route: "/ai-pro" as const,
    role: "Recherche réelle, comparaison et carnet connecté",
  },
} as const;

export const AI_OFFER_ORDER = [AI_OFFERS.free, AI_OFFERS.plus] as const;

export type AiOfferId = (typeof AI_OFFER_ORDER)[number]["id"];

export function aiOfferCount() {
  return AI_OFFER_ORDER.length;
}
