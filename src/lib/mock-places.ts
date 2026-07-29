import { PLACE_CATEGORIES } from "./countries";

export type MockPlace = {
  id: string;
  name: string;
  category: (typeof PLACE_CATEGORIES)[number]["value"];
  country: string;
  city: string;
  lat: number;
  lng: number;
  description: string;
  image_url: string;
  photos: string[];
  budget: 1 | 2 | 3 | 4; // €, €€, €€€, €€€€
  rating: number; // 0-5
  reviews_count: number;
  hours: string;
  comments: { author: string; text: string; avatar: string }[];
};

// Anchor cities with coords
const CITIES: { city: string; country: string; lat: number; lng: number }[] = [
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { city: "Nice", country: "France", lat: 43.7102, lng: 7.262 },
  { city: "Lisbonne", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { city: "Barcelone", country: "Espagne", lat: 41.3851, lng: 2.1734 },
  { city: "Rome", country: "Italie", lat: 41.9028, lng: 12.4964 },
  { city: "Santorin", country: "Grèce", lat: 36.3932, lng: 25.4615 },
  { city: "Istanbul", country: "Turquie", lat: 41.0082, lng: 28.9784 },
  { city: "Marrakech", country: "Maroc", lat: 31.6295, lng: -7.9811 },
  { city: "Le Caire", country: "Égypte", lat: 30.0444, lng: 31.2357 },
  { city: "Le Cap", country: "Afrique du Sud", lat: -33.9249, lng: 18.4241 },
  { city: "Zanzibar", country: "Tanzanie", lat: -6.1659, lng: 39.2026 },
  { city: "Dubaï", country: "Émirats Arabes Unis", lat: 25.2048, lng: 55.2708 },
  { city: "Mumbai", country: "Inde", lat: 19.076, lng: 72.8777 },
  { city: "Bangkok", country: "Thaïlande", lat: 13.7563, lng: 100.5018 },
  { city: "Chiang Mai", country: "Thaïlande", lat: 18.7883, lng: 98.9853 },
  { city: "Bali", country: "Indonésie", lat: -8.3405, lng: 115.092 },
  { city: "Ho Chi Minh", country: "Vietnam", lat: 10.8231, lng: 106.6297 },
  { city: "Hanoï", country: "Vietnam", lat: 21.0285, lng: 105.8542 },
  { city: "Singapour", country: "Singapour", lat: 1.3521, lng: 103.8198 },
  { city: "Tokyo", country: "Japon", lat: 35.6762, lng: 139.6503 },
  { city: "Kyoto", country: "Japon", lat: 35.0116, lng: 135.7681 },
  { city: "Séoul", country: "Corée du Sud", lat: 37.5665, lng: 126.978 },
  { city: "Sydney", country: "Australie", lat: -33.8688, lng: 151.2093 },
  { city: "Auckland", country: "Nouvelle-Zélande", lat: -36.8485, lng: 174.7633 },
  { city: "Los Angeles", country: "États-Unis", lat: 34.0522, lng: -118.2437 },
  { city: "New York", country: "États-Unis", lat: 40.7128, lng: -74.006 },
  { city: "Miami", country: "États-Unis", lat: 25.7617, lng: -80.1918 },
  { city: "Mexico", country: "Mexique", lat: 19.4326, lng: -99.1332 },
  { city: "Tulum", country: "Mexique", lat: 20.2114, lng: -87.4654 },
  { city: "La Havane", country: "Cuba", lat: 23.1136, lng: -82.3666 },
  { city: "Rio de Janeiro", country: "Brésil", lat: -22.9068, lng: -43.1729 },
  { city: "Buenos Aires", country: "Argentine", lat: -34.6037, lng: -58.3816 },
  { city: "Cusco", country: "Pérou", lat: -13.5319, lng: -71.9675 },
  { city: "Reykjavik", country: "Islande", lat: 64.1466, lng: -21.9426 },
  { city: "Amsterdam", country: "Pays-Bas", lat: 52.3676, lng: 4.9041 },
  { city: "Berlin", country: "Allemagne", lat: 52.52, lng: 13.405 },
  { city: "Prague", country: "République Tchèque", lat: 50.0755, lng: 14.4378 },
  { city: "Vienne", country: "Autriche", lat: 48.2082, lng: 16.3738 },
  { city: "Londres", country: "Royaume-Uni", lat: 51.5074, lng: -0.1278 },
  { city: "Dublin", country: "Irlande", lat: 53.3498, lng: -6.2603 },
  { city: "Malé", country: "Maldives", lat: 4.1755, lng: 73.5093 },
];

// Curated Unsplash images per category
const IMAGES: Record<string, string[]> = {
  restaurant: [
    "photo-1517248135467-4c7edcad34c4",
    "photo-1552566626-52f8b828add9",
    "photo-1414235077428-338989a2e8c0",
    "photo-1592861956120-e524fc739696",
  ],
  plage: [
    "photo-1507525428034-b723cf961d3e",
    "photo-1519046904884-53103b34b206",
    "photo-1506929562872-bb421503ef21",
    "photo-1533760881669-80db4d7b341a",
  ],
  cascade: [
    "photo-1432405972618-c60b0225b8f9",
    "photo-1467890947394-8171244e5410",
    "photo-1508739773434-c26b3d09e071",
    "photo-1583373834259-46cc92173cb7",
  ],
  plongee: [
    "photo-1544551763-46a013bb70d5",
    "photo-1518623489648-a173ef7824f3",
    "photo-1682687982501-1e58ab814714",
    "photo-1682687982468-4584ff11f88a",
  ],
  hotel: [
    "photo-1566073771259-6a8506099945",
    "photo-1520250497591-112f2f40a3f4",
    "photo-1571003123894-1f0594d2b5d9",
    "photo-1445019980597-93fa8acb246c",
  ],
  randonnee: [
    "photo-1551632811-561732d1e306",
    "photo-1464822759023-fed622ff2c3b",
    "photo-1483728642387-6c3bdd6c93e5",
    "photo-1454496522488-7a8e488e8606",
  ],
  vie_nocturne: [
    "photo-1571266028243-e4bb35f6b7f9",
    "photo-1470229722913-7c0e2dbbafd3",
    "photo-1516450360452-9312f5e86fc7",
    "photo-1493676304819-0d7a8d026dcf",
  ],
  shopping: [
    "photo-1481437156560-3205f6a55735",
    "photo-1445205170230-053b83016050",
    "photo-1483985988355-763728e1935b",
    "photo-1567401893414-76b7b1e5a7a5",
  ],
  pharmacie: [
    "photo-1587854692152-cbe660dbde88",
    "photo-1576091160399-112ba8d25d1d",
    "photo-1631549916768-4119b2e5f926",
  ],
  distributeur: [
    "photo-1580519542036-c47de6196ba5",
    "photo-1601597111158-2fceff292cdc",
    "photo-1554224155-6726b3ff858f",
  ],
  cache: [
    "photo-1500530855697-b586d89ba3ee",
    "photo-1476514525535-07fb3b4ae5f1",
    "photo-1470071459604-3b5ec3a7fe05",
  ],
  wifi: [
    "photo-1521737604893-d14cc237f11d",
    "photo-1497215728101-856f4ea42174",
    "photo-1554118811-1e0d58224f24",
  ],
  bar: [
    "photo-1514933651103-005eec06c04b",
    "photo-1546171753-97d7676e4602",
    "photo-1470337458703-46ad1756a187",
    "photo-1572116469696-31de0f17cc34",
  ],
  musee: [
    "photo-1565060299011-2b8ab8b0d1d3",
    "photo-1554907984-15263bfd63bd",
    "photo-1499426600726-a950358acf16",
    "photo-1503152394-c571994fd383",
  ],
  activite: [
    "photo-1533130061792-64b345e4a833",
    "photo-1530866495561-507c9faab2ed",
    "photo-1533105079780-92b9be482077",
    "photo-1526772662000-3f88f10405ff",
  ],
};

const IMG = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

const NAME_TEMPLATES: Record<string, string[]> = {
  restaurant: ["Chez Marco", "La Table de", "Le Bistrot de", "Ocean Kitchen", "Sunset Grill", "Little Spoon"],
  plage: ["Plage de", "Baie de", "Playa", "Hidden Cove", "Golden Sands"],
  cascade: ["Cascade de", "Rainbow Falls", "Chutes de", "Silver Falls"],
  plongee: ["Spot de", "Blue Reef", "Coral Garden", "Manta Point"],
  hotel: ["Hôtel", "Riad", "Boutique Stay", "Villa", "Palace"],
  randonnee: ["Sentier de", "Trail des", "GR de", "Chemin de"],
  vie_nocturne: ["Club", "Night Loft", "Rooftop", "Underground"],
  shopping: ["Marché de", "Bazaar", "Souk", "Mall"],
  pharmacie: ["Pharmacie", "Farmacia", "Chemist"],
  distributeur: ["ATM", "Distributeur", "Cash Point"],
  cache: ["Spot secret", "Hidden gem", "Lieu caché"],
  wifi: ["Coworking", "Café Wi-Fi", "Digital Nomad Spot"],
  bar: ["Sky Bar", "Corner Bar", "Le Tonneau", "Speakeasy"],
  musee: ["Musée de", "Museum of", "Galerie", "Fondation"],
  activite: ["Tour de", "Excursion", "Aventure", "Balade"],
};

const DESCRIPTIONS: Record<string, string[]> = {
  restaurant: ["Cuisine locale généreuse, ambiance chaleureuse et prix doux.", "Une pépite culinaire recommandée par les habitants.", "Fusion créative et produits du marché."],
  plage: ["Sable blanc, eau turquoise et cocotiers. Le paradis.", "Idéal au coucher du soleil, peu de monde en semaine.", "Snorkeling accessible directement depuis la plage."],
  cascade: ["Randonnée de 30 min puis baignade rafraîchissante.", "Impressionnante après la saison des pluies.", "Vue à couper le souffle et arc-en-ciel garantis."],
  plongee: ["Récif corallien préservé, raies mantas fréquentes.", "Site accessible aux débutants, visibilité 20m+.", "Épave à 18m, poissons pélagiques."],
  hotel: ["Rapport qualité-prix imbattable, personnel adorable.", "Design contemporain avec rooftop et piscine.", "Ambiance familiale, petit-déjeuner généreux."],
  randonnee: ["Boucle de 12 km, dénivelé modéré, panoramas exceptionnels.", "Départ tôt le matin recommandé, prévoir 2L d'eau.", "Sentier balisé accessible aux enfants."],
  vie_nocturne: ["Ambiance électrique jusqu'au petit matin.", "Rooftop avec vue imprenable et cocktails signature.", "Live music et DJ sets tous les week-ends."],
  shopping: ["Artisanat local, épices, tissus. Marchandage attendu.", "Boutiques créateurs et concept-stores.", "Marché coloré, y aller le matin."],
  pharmacie: ["Personnel qui parle anglais, ouvert 7j/7.", "Pharmacie de garde, service rapide.", "Stock complet, tests et vaccins disponibles."],
  distributeur: ["Distributeur fiable, faibles frais internationaux.", "Accepte Visa/Mastercard, 24/7.", "Bien situé, sécurisé."],
  cache: ["Vraie pépite, aucun touriste. À découvrir.", "Point de vue secret partagé par les locaux.", "Cachée derrière la végétation, magique au lever du soleil."],
  wifi: ["Fibre rapide, prises partout, café excellent.", "Espace calme parfait pour digital nomads.", "Ouvert tard, ambiance studieuse."],
  bar: ["Cocktails créatifs et vue panoramique.", "Bar de quartier authentique, prix locaux.", "Terrasse fleurie, happy hour 18h-20h."],
  musee: ["Collection permanente exceptionnelle, expo temporaire à ne pas manquer.", "Compter 2h de visite, audio-guide inclus.", "Architecture spectaculaire, café sur le toit."],
  activite: ["Guide passionnant, matériel fourni, sécurité maximale.", "Expérience unique à vivre au moins une fois.", "Petits groupes, réservation conseillée."],
};

const HOURS = [
  "Ouvert 7j/7 · 08h – 23h",
  "Lun–Sam · 10h – 19h",
  "Ouvert 24h/24",
  "Mer–Dim · 12h – 22h",
  "Tous les jours · 09h – 18h",
];

const AUTHORS = ["Léa M.", "Julien P.", "Amélie R.", "Karim S.", "Chloé D.", "Marco V.", "Sophia L.", "Théo B.", "Nina K.", "Antoine G."];
const COMMENTS: Record<string, string[]> = {
  restaurant: ["Un vrai coup de cœur, on y retourne dès demain !", "Service au top, prix corrects.", "Le plat signature vaut le détour."],
  plage: ["Paradisiaque, on s'y croirait seuls au monde.", "Attention aux oursins, mais l'eau est divine.", "Coucher de soleil magique."],
  cascade: ["La marche vaut largement l'effort.", "Baignade fraîche et vivifiante.", "Un des plus beaux endroits du voyage."],
  plongee: ["Instructeur adorable, faune incroyable.", "Visibilité parfaite, tortues au rendez-vous.", "Meilleur spot de la région sans hésiter."],
  hotel: ["Chambre spacieuse, staff prévenant.", "Emplacement idéal, on recommande.", "Petit-déj' délicieux et copieux."],
  randonnee: ["Panorama à couper le souffle en haut.", "Bien balisé, prévoyez de bonnes chaussures.", "Faisable en famille avec enfants +8 ans."],
  vie_nocturne: ["Ambiance de folie jusqu'à 4h du matin.", "DJ excellent, foule cosmopolite.", "Cocktails un peu chers mais l'endroit vaut le coup."],
  shopping: ["Trouvé des pièces uniques à bon prix.", "Marchandage indispensable, mais fun.", "Ambiance authentique et colorée."],
  pharmacie: ["Personnel efficace et parlant anglais.", "Bien approvisionnée.", "Ouvert tard, très pratique."],
  distributeur: ["Fonctionne parfaitement avec ma Revolut.", "Frais raisonnables.", "Facile à trouver."],
  cache: ["On était seuls, magique.", "Merci pour le partage, endroit incroyable.", "Vraiment hors des sentiers battus."],
  wifi: ["Connexion ultra rapide, parfait pour bosser.", "Café excellent, ambiance calme.", "Mon spot préféré de la ville."],
  bar: ["Cocktails créatifs, vue magnifique.", "Ambiance super, on y est restés jusqu'à la fermeture.", "Barmen passionnés."],
  musee: ["Expo temporaire fascinante.", "Compter minimum 2 heures.", "Le café sur le toit est un plus."],
  activite: ["Expérience inoubliable !", "Guide au top, matériel nickel.", "À faire absolument."],
};

function seedRandom(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

export const MOCK_PLACES: MockPlace[] = (() => {
  const rnd = seedRandom(42);
  const allCats = PLACE_CATEGORIES.map((c) => c.value);
  // Guarantee at least these categories in every city so search-by-city is comprehensive.
  const guaranteed: MockPlace["category"][] = [
    "restaurant", "restaurant", "hotel", "hotel", "activite", "musee", "bar", "photospot",
  ];
  const out: MockPlace[] = [];
  let id = 0;
  for (const c of CITIES) {
    // 10 places per city: 8 guaranteed + 2 varied
    const cats: MockPlace["category"][] = [
      ...guaranteed,
      allCats[Math.floor(rnd() * allCats.length)]!,
      allCats[Math.floor(rnd() * allCats.length)]!,
    ];
    for (let i = 0; i < cats.length; i++) {
      const category = cats[i]!;
      const imgs = IMAGES[category] ?? IMAGES.activite!;
      const mainImg = imgs[Math.floor(rnd() * imgs.length)]!;
      const gallery = Array.from({ length: 4 }, () => IMG(pick(imgs, rnd), 800));
      const nameBase = pick(NAME_TEMPLATES[category] ?? ["Lieu"], rnd);
      const name = /de$|of$/.test(nameBase.trim()) ? `${nameBase} ${c.city}` : `${nameBase} ${c.city}`;
      const commentsForCat = COMMENTS[category] ?? [];
      out.push({
        id: `mock-${id++}`,
        name,
        category,
        country: c.country,
        city: c.city,
        lat: c.lat + (rnd() - 0.5) * 0.4,
        lng: c.lng + (rnd() - 0.5) * 0.4,
        description: pick(DESCRIPTIONS[category] ?? ["Un lieu à découvrir."], rnd),
        image_url: IMG(mainImg, 1400),
        photos: gallery,
        budget: (Math.floor(rnd() * 4) + 1) as 1 | 2 | 3 | 4,
        rating: Math.round((3.6 + rnd() * 1.4) * 10) / 10,
        reviews_count: Math.floor(20 + rnd() * 1800),
        hours: pick(HOURS, rnd),
        comments: Array.from({ length: 3 }, (_, k) => ({
          author: AUTHORS[(id + k) % AUTHORS.length]!,
          text: commentsForCat[k % commentsForCat.length] ?? "Super endroit.",
          avatar: `https://i.pravatar.cc/80?img=${((id + k) % 70) + 1}`,
        })),
      });
    }
  }
  return out;
})();
