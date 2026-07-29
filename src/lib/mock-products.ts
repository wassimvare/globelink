// Fallback catalog shown when the marketplace has no real rows yet.
export type ProductType = "guide_pdf" | "itineraire" | "preset" | "ebook" | "accompagnement";

export const PRODUCT_TYPES: { value: ProductType; label: string; emoji: string }[] = [
  { value: "guide_pdf", label: "Guide PDF", emoji: "📕" },
  { value: "itineraire", label: "Itinéraire", emoji: "🗺️" },
  { value: "preset", label: "Preset Lightroom", emoji: "🎞️" },
  { value: "ebook", label: "Ebook", emoji: "📖" },
  { value: "accompagnement", label: "Accompagnement", emoji: "🎧" },
];

export type MockProduct = {
  id: string;
  type: ProductType;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  cover_url: string;
  tags: string[];
  rating_avg: number;
  rating_count: number;
  favorites_count: number;
  seller: { name: string; username: string; avatar: string };
};

const A = (n: number) => `https://i.pravatar.cc/160?img=${n}`;
const cover = (id: string, seed: number) => `https://images.unsplash.com/photo-${id}?w=900&auto=format&fit=crop&q=70&sig=${seed}`;

export const MOCK_PRODUCTS: MockProduct[] = [
  {
    id: "mp1", type: "guide_pdf",
    title: "Bali secret — 42 spots hors des radars",
    description: "Un guide de 68 pages avec cartes GPS, adresses locales et horaires idéaux. Testé sur 3 mois de terrain.",
    price_cents: 1900, currency: "EUR",
    cover_url: cover("1518544801976-3e159e50e5bb", 1),
    tags: ["Bali", "Guide", "Voyage lent"],
    rating_avg: 4.9, rating_count: 128, favorites_count: 342,
    seller: { name: "Léa Moreau", username: "lea", avatar: A(47) },
  },
  {
    id: "mp2", type: "itineraire",
    title: "Road-trip Islande 10 jours — Ring Road complet",
    description: "Itinéraire jour-par-jour avec logements, restos et coups de cœur photo. Format PDF + Google Maps importable.",
    price_cents: 2900, currency: "EUR",
    cover_url: cover("1500530855697-b586d89ba3ee", 2),
    tags: ["Islande", "Road-trip", "Nature"],
    rating_avg: 4.8, rating_count: 74, favorites_count: 210,
    seller: { name: "Nina K.", username: "nina", avatar: A(9) },
  },
  {
    id: "mp3", type: "preset",
    title: "Presets Ocean Deep — 12 filtres Lightroom",
    description: "12 presets desktop + mobile pensés pour les couchers de soleil, l'océan et les tons chauds tropicaux.",
    price_cents: 1400, currency: "EUR",
    cover_url: cover("1507525428034-b723cf961d3e", 3),
    tags: ["Photo", "Lightroom", "Océan"],
    rating_avg: 4.7, rating_count: 213, favorites_count: 588,
    seller: { name: "Amélie R.", username: "amelie", avatar: A(32) },
  },
  {
    id: "mp4", type: "ebook",
    title: "Le carnet du voyageur solo",
    description: "128 pages : préparer, s'organiser, gérer les moments seuls, rencontrer sans forcer. + templates journaling.",
    price_cents: 1200, currency: "EUR",
    cover_url: cover("1476514525535-07fb3b4ae5f1", 4),
    tags: ["Solo", "Slow travel", "Mindset"],
    rating_avg: 4.6, rating_count: 89, favorites_count: 176,
    seller: { name: "Chloé D.", username: "chloe", avatar: A(48) },
  },
  {
    id: "mp5", type: "accompagnement",
    title: "1h de coaching — planifie ton tour d'Asie",
    description: "Session en visio avec bilan personnalisé, budget, saisonnalité, visas et itinéraire optimisé.",
    price_cents: 6900, currency: "EUR",
    cover_url: cover("1488646953014-85cb44e25828", 5),
    tags: ["Asie", "Coaching", "Sur mesure"],
    rating_avg: 5.0, rating_count: 32, favorites_count: 94,
    seller: { name: "Théo B.", username: "theo", avatar: A(60) },
  },
  {
    id: "mp6", type: "guide_pdf",
    title: "Marrakech & Atlas — 5 jours parfaits",
    description: "Un mini-guide dense : souks, riads, Merzouga, trek Toubkal. Avec budget détaillé en MAD et en EUR.",
    price_cents: 900, currency: "EUR",
    cover_url: cover("1489749798305-4fea3ae63d43", 6),
    tags: ["Maroc", "City guide"],
    rating_avg: 4.5, rating_count: 61, favorites_count: 122,
    seller: { name: "Karim S.", username: "karim", avatar: A(15) },
  },
  {
    id: "mp7", type: "preset",
    title: "Presets Golden Hour — 8 filtres portraits",
    description: "Rendu chaud et doré, parfait pour les portraits en fin de journée. Desktop + mobile.",
    price_cents: 1100, currency: "EUR",
    cover_url: cover("1502920917128-1aa500764cbd", 7),
    tags: ["Photo", "Portrait"],
    rating_avg: 4.4, rating_count: 47, favorites_count: 138,
    seller: { name: "Amélie R.", username: "amelie", avatar: A(32) },
  },
  {
    id: "mp8", type: "itineraire",
    title: "Pérou — Salkantay + Amazonie 18 jours",
    description: "Itinéraire aventure prêt à suivre, avec agences testées, budget, altitude et repos programmé.",
    price_cents: 2400, currency: "EUR",
    cover_url: cover("1526392060635-9d6019884377", 8),
    tags: ["Pérou", "Trek", "Amazonie"],
    rating_avg: 4.9, rating_count: 51, favorites_count: 164,
    seller: { name: "Chloé D.", username: "chloe", avatar: A(48) },
  },
];

export function formatPrice(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}
