export type ProductType = "guide_pdf" | "itineraire" | "preset" | "ebook" | "accompagnement";

export const PRODUCT_TYPES: Array<{ value: ProductType; label: string; emoji: string }> = [
  { value: "guide_pdf", label: "Guide PDF", emoji: "📕" },
  { value: "itineraire", label: "Itinéraire", emoji: "🗺️" },
  { value: "preset", label: "Preset photo", emoji: "🎞️" },
  { value: "ebook", label: "Ebook", emoji: "📖" },
  { value: "accompagnement", label: "Accompagnement", emoji: "🎧" },
];

export function formatPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
