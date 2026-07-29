// Real partner offers. The selection is renewed automatically every day:
// a date-seeded shuffle picks the offers of the day, so the homepage and the
// /deals page always show a fresh, deterministic line-up (same for everyone).

const img = (id: string, w = 1200, h = 750) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

export type Deal = {
  slug: string;
  title: string;
  destination: string;
  price: string;
  from: string;
  badge: string;
  partner: string;
  /** Real, public partner URL — opens the booking/search page for this offer. */
  url: string;
  image: string;
  description: string;
  highlights: string[];
  category: "Vol" | "Séjour" | "Hôtel" | "Activité" | "Train" | "Location";
};

export const DEALS_CATALOG: Deal[] = [
  {
    slug: "vol-paris-tokyo",
    title: "Vol Paris → Tokyo",
    destination: "Tokyo, Japon",
    price: "dès 489 €",
    from: "Paris (CDG)",
    badge: "Aller-retour",
    partner: "Skyscanner",
    url: "https://www.skyscanner.fr/transport/vols/pari/tyoa/",
    image: img("1503899036084-c55cdd92da26"),
    category: "Vol",
    description:
      "Compare en direct tous les vols Paris → Tokyo sur Skyscanner : dates flexibles, escales courtes et alertes de prix pour partir au meilleur tarif.",
    highlights: ["Aller-retour, bagage cabine inclus", "Calendrier des prix sur 12 mois", "Alerte prix gratuite"],
  },
  {
    slug: "sejour-bali",
    title: "Séjour à Bali",
    destination: "Bali, Indonésie",
    price: "dès 699 €",
    from: "France",
    badge: "Vol + hôtel",
    partner: "Booking.com",
    url: "https://www.booking.com/searchresults.fr.html?ss=Bali%2C+Indon%C3%A9sie",
    image: img("1518548419970-58e3b4079ab2"),
    category: "Séjour",
    description:
      "Villas avec piscine à Ubud, Canggu ou Uluwatu. Annulation gratuite sur la majorité des logements et paiement à l'arrivée.",
    highlights: ["Annulation gratuite", "Petit-déjeuner souvent inclus", "Notes vérifiées par les voyageurs"],
  },
  {
    slug: "city-break-lisbonne",
    title: "City break à Lisbonne",
    destination: "Lisbonne, Portugal",
    price: "dès 229 €",
    from: "Paris / Lyon",
    badge: "3 nuits",
    partner: "Booking.com",
    url: "https://www.booking.com/searchresults.fr.html?ss=Lisbonne%2C+Portugal",
    image: img("1513735492246-483525079686"),
    category: "Hôtel",
    description:
      "Trois nuits dans l'Alfama ou le Chiado, à deux pas des miradouros. Idéal pour un week-end prolongé toute l'année.",
    highlights: ["Quartiers centraux", "Rooftops et pastéis à volonté", "Vols courts depuis la France"],
  },
  {
    slug: "vol-paris-new-york",
    title: "Vol Paris → New York",
    destination: "New York, États-Unis",
    price: "dès 349 €",
    from: "Paris (CDG/ORY)",
    badge: "-35%",
    partner: "Kayak",
    url: "https://www.kayak.fr/flights/PAR-NYC",
    image: img("1496442226666-8d4d0e62e6e9"),
    category: "Vol",
    description:
      "Kayak scanne des centaines de sites pour trouver le meilleur Paris → New York, avec prévision de prix et filtres escales.",
    highlights: ["Prévision de prix", "Vols directs filtrables", "Comparateur multi-compagnies"],
  },
  {
    slug: "riad-marrakech",
    title: "Riad à Marrakech",
    destination: "Marrakech, Maroc",
    price: "dès 45 € / nuit",
    from: "—",
    badge: "Coup de cœur",
    partner: "Booking.com",
    url: "https://www.booking.com/searchresults.fr.html?ss=Marrakech%2C+Maroc",
    image: img("1597212618440-806262de4f6b"),
    category: "Hôtel",
    description:
      "Riads traditionnels avec patio et terrasse dans la médina, souvent avec hammam et petit-déjeuner marocain inclus.",
    highlights: ["Médina à pied", "Terrasse & piscine", "Petit-déjeuner inclus"],
  },
  {
    slug: "aurores-boreales-tromso",
    title: "Chasse aux aurores boréales",
    destination: "Tromsø, Norvège",
    price: "dès 129 €",
    from: "Tromsø",
    badge: "Best-seller",
    partner: "GetYourGuide",
    url: "https://www.getyourguide.fr/tromso-l1226/",
    image: img("1483347756197-71ef80e95f73"),
    category: "Activité",
    description:
      "Excursion en minibus avec guide photo, combinaison grand froid fournie et boissons chaudes autour du feu.",
    highlights: ["Annulation gratuite 24 h avant", "Photos offertes", "Petits groupes"],
  },
  {
    slug: "cours-cuisine-thai",
    title: "Cours de cuisine thaï",
    destination: "Chiang Mai, Thaïlande",
    price: "dès 32 €",
    from: "Chiang Mai",
    badge: "4,9/5",
    partner: "GetYourGuide",
    url: "https://www.getyourguide.fr/chiang-mai-l236/",
    image: img("1559847844-5315695dadae"),
    category: "Activité",
    description:
      "Marché local, cinq plats préparés avec un chef, dégustation et livret de recettes à rapporter. Options végé et vegan.",
    highlights: ["Transfert hôtel inclus", "Options végé / vegan", "Réservation instantanée"],
  },
  {
    slug: "train-paris-milan",
    title: "Train Paris → Milan",
    destination: "Milan, Italie",
    price: "dès 29 €",
    from: "Paris Gare de Lyon",
    badge: "Bas carbone",
    partner: "Omio",
    url: "https://www.omio.fr/",
    image: img("1520175480921-4edfa2983e0f"),
    category: "Train",
    description:
      "Traversée des Alpes en train à grande vitesse : compare trains, bus et vols sur un seul écran et réserve en deux minutes.",
    highlights: ["Billets mobiles", "Comparateur train / bus / avion", "Empreinte carbone affichée"],
  },
  {
    slug: "van-islande",
    title: "Van aménagé en Islande",
    destination: "Reykjavík, Islande",
    price: "dès 89 € / jour",
    from: "Aéroport de Keflavík",
    badge: "Road trip",
    partner: "Rentalcars",
    url: "https://www.rentalcars.com/fr/city/is/reykjavik/",
    image: img("1504829857797-ddff29c27927"),
    category: "Location",
    description:
      "La Ring Road en liberté : véhicule 4x4 ou van, assurance gravier recommandée, retrait directement à l'aéroport.",
    highlights: ["Kilométrage illimité", "Annulation gratuite", "Retrait à l'aéroport"],
  },
  {
    slug: "safari-serengeti",
    title: "Safari dans le Serengeti",
    destination: "Serengeti, Tanzanie",
    price: "dès 1 190 €",
    from: "Arusha",
    badge: "Grande migration",
    partner: "GetYourGuide",
    url: "https://www.getyourguide.fr/serengeti-national-park-l82458/",
    image: img("1516426122078-c23e76319801"),
    category: "Activité",
    description:
      "Trois jours de safari en 4x4 toit ouvrant, lodge en pleine savane, guide francophone et pique-nique dans la brousse.",
    highlights: ["Big Five", "Guide francophone", "Pension complète"],
  },
  {
    slug: "vol-paris-marrakech",
    title: "Vol Paris → Marrakech",
    destination: "Marrakech, Maroc",
    price: "dès 59 €",
    from: "Paris (ORY/BVA)",
    badge: "Aller simple",
    partner: "Skyscanner",
    url: "https://www.skyscanner.fr/transport/vols/pari/rak/",
    image: img("1539020140153-e479b8c22e70"),
    category: "Vol",
    description:
      "Vols low-cost vers Marrakech quasiment tous les jours : 3 h de vol pour changer complètement de décor.",
    highlights: ["3 h de vol", "Départs quotidiens", "Alerte prix gratuite"],
  },
  {
    slug: "appart-kyoto",
    title: "Machiya à Kyoto",
    destination: "Kyoto, Japon",
    price: "dès 74 € / nuit",
    from: "—",
    badge: "Saison des érables",
    partner: "Booking.com",
    url: "https://www.booking.com/searchresults.fr.html?ss=Kyoto%2C+Japon",
    image: img("1493976040374-85c8e12f0c0e"),
    category: "Hôtel",
    description:
      "Maisons traditionnelles en bois près de Gion et Higashiyama, tatamis, ofuro et ruelles à lanternes au coucher du soleil.",
    highlights: ["Quartier historique", "Maison traditionnelle", "Annulation gratuite"],
  },
];

/** Days since epoch (UTC) — renews every day and stays identical server/client. */
export function dealsDayIndex(now: Date = new Date()) {
  return Math.floor(now.getTime() / 86_400_000);
}

function seededOrder(seed: number, length: number) {
  // Deterministic rotation + stride so the daily set really changes.
  const stride = 5; // coprime with the catalog length (12)
  const order: number[] = [];
  for (let i = 0; i < length; i++) order.push((seed * 7 + i * stride) % length);
  return order.filter((v, i, arr) => arr.indexOf(v) === i);
}

/** Offers of the day, renewed automatically every day. */
export function dealsOfTheDay(count = DEALS_CATALOG.length, now: Date = new Date()): Deal[] {
  const order = seededOrder(dealsDayIndex(now), DEALS_CATALOG.length);
  return order.map((i) => DEALS_CATALOG[i]).slice(0, count);
}

export function getDeal(slug: string) {
  return DEALS_CATALOG.find((d) => d.slug === slug);
}

export function dealsRefreshLabel(now: Date = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(now);
}
