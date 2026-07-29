// Curated info per country for the country panel on the map.
// Realistic mock data for a premium demo feel.
export type CountryInfo = {
  code: string; // ISO-3166 alpha-2 (lowercase)
  name: string;
  emoji: string;
  center: [number, number]; // [lat, lng]
  cover: string;
  gallery: string[];
  bestTime: string;
  costPerDay: string; // in EUR range
  safety: "Très sûr" | "Sûr" | "Prudence" | "Risqué";
  weatherNow: string;
  activities: string[];
  tags: string[];
  currency: string;
  language: string;
  intro: string;
};

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`;

export const COUNTRY_INFO: CountryInfo[] = [
  {
    code: "jp", name: "Japon", emoji: "🇯🇵", center: [36.2, 138.25],
    cover: img("photo-1493976040374-85c8e12f0c0e"),
    gallery: [img("photo-1528164344705-47542687000d"), img("photo-1524413840807-0c3cb6fa808d"), img("photo-1545569341-9eb8b30979d9"), img("photo-1490806843957-31f4c9a91c65")],
    bestTime: "Mars-Mai (sakura) · Oct-Nov (érables)",
    costPerDay: "90-140 €",
    safety: "Très sûr",
    weatherNow: "Ensoleillé · 21°C",
    activities: ["Ryokan à Kyoto", "Ramen tour Tokyo", "Mont Fuji au lever", "Onsen à Hakone", "Tsukiji au petit-matin"],
    tags: ["Culture", "Gastronomie", "Nature", "Ville"],
    currency: "JPY",
    language: "Japonais",
    intro: "Néons de Tokyo, temples de Kyoto, ryokans thermaux et montagnes sacrées : un choc culturel doux et fascinant.",
  },
  {
    code: "id", name: "Indonésie", emoji: "🇮🇩", center: [-2.5, 118],
    cover: img("photo-1537996194471-e657df975ab4"),
    gallery: [img("photo-1518548419970-58e3b4079ab2"), img("photo-1604999565976-8913ad2ddb7c"), img("photo-1512100356356-de1b84283e18"), img("photo-1518623489648-a173ef7824f3")],
    bestTime: "Mai-Septembre (saison sèche)",
    costPerDay: "35-60 €",
    safety: "Sûr",
    weatherNow: "Nuageux · 29°C",
    activities: ["Nusa Penida day trip", "Surf à Uluwatu", "Rizières de Ubud", "Plongée à Komodo", "Lever de soleil sur Mont Batur"],
    tags: ["Plages", "Plongée", "Spiritualité", "Backpacker"],
    currency: "IDR",
    language: "Indonésien",
    intro: "Bali, Lombok, Java, Sumatra : plus de 17 000 îles entre rizières, volcans et récifs coralliens.",
  },
  {
    code: "fr", name: "France", emoji: "🇫🇷", center: [46.6, 2.3],
    cover: img("photo-1502602898657-3e91760cbb34"),
    gallery: [img("photo-1499856871958-5b9627545d1a"), img("photo-1522093007474-d86e9bf7ba6f"), img("photo-1522093537031-3ee69e6b1746"), img("photo-1541701494587-cb58502866ab")],
    bestTime: "Avril-Juin · Sept-Oct",
    costPerDay: "110-180 €",
    safety: "Sûr",
    weatherNow: "Ciel voilé · 17°C",
    activities: ["Paris à vélo", "Route des vins Bordeaux", "Calanques de Cassis", "Château de la Loire", "Ski dans les Alpes"],
    tags: ["Culture", "Vin", "Mer", "Montagne"],
    currency: "EUR",
    language: "Français",
    intro: "Vignobles, châteaux, plages méditerranéennes et sommets alpins — un condensé d'Europe.",
  },
  {
    code: "it", name: "Italie", emoji: "🇮🇹", center: [42.5, 12.5],
    cover: img("photo-1531572753322-ad063cecc140"),
    gallery: [img("photo-1552832230-c0197dd311b5"), img("photo-1516483638261-f4dbaf036963"), img("photo-1523906630133-f6934a1ab2b9"), img("photo-1533106418989-88406c7cc8ca")],
    bestTime: "Mai-Juin · Septembre",
    costPerDay: "95-150 €",
    safety: "Sûr",
    weatherNow: "Soleil · 24°C",
    activities: ["Cinque Terre à pied", "Vespa dans Rome", "Gondole à Venise", "Truffe en Toscane", "Dolomites en été"],
    tags: ["Gastronomie", "Art", "Mer", "Villages"],
    currency: "EUR",
    language: "Italien",
    intro: "Pâtes, ruines, îles turquoise et villages perchés : la dolce vita à toutes les échelles.",
  },
  {
    code: "th", name: "Thaïlande", emoji: "🇹🇭", center: [13, 100.5],
    cover: img("photo-1552465011-b4e21bf6e79a"),
    gallery: [img("photo-1528181304800-259b08848526"), img("photo-1506665531195-3566af2b4dfa"), img("photo-1552832230-c0197dd311b5"), img("photo-1509233725247-49e657c54213")],
    bestTime: "Novembre-Février",
    costPerDay: "30-55 €",
    safety: "Sûr",
    weatherNow: "Chaud · 32°C",
    activities: ["Îles de Krabi", "Street food Bangkok", "Trek à Chiang Mai", "Full Moon Party", "Refuge d'éléphants"],
    tags: ["Plages", "Backpacker", "Street food", "Jungle"],
    currency: "THB",
    language: "Thaï",
    intro: "Bangkok trépidante, plages du sud, temples du nord et nourriture inoubliable pour presque rien.",
  },
  {
    code: "us", name: "États-Unis", emoji: "🇺🇸", center: [39.5, -98.35],
    cover: img("photo-1485871981521-5b1fd3805eee"),
    gallery: [img("photo-1483729558449-99ef09a8c325"), img("photo-1499856871958-5b9627545d1a"), img("photo-1502920917128-1aa500764cbd"), img("photo-1502602898657-3e91760cbb34")],
    bestTime: "Toute l'année selon la région",
    costPerDay: "130-220 €",
    safety: "Prudence",
    weatherNow: "Variable · 18°C",
    activities: ["Road trip côte Ouest", "New York en 5 jours", "Grand Canyon", "Vegas & Death Valley", "Yellowstone"],
    tags: ["Road trip", "Ville", "Nature", "National Parks"],
    currency: "USD",
    language: "Anglais",
    intro: "Un continent : mégapoles électriques, parcs nationaux immenses et road trips mythiques.",
  },
  {
    code: "es", name: "Espagne", emoji: "🇪🇸", center: [40.4, -3.7],
    cover: img("photo-1543783207-ec64e4d95325"),
    gallery: [img("photo-1509840841025-9088ba78a826"), img("photo-1509604931938-5b0e3d17d29d"), img("photo-1522602573003-b7dc9ba5f5e2"), img("photo-1522093007474-d86e9bf7ba6f")],
    bestTime: "Mai-Juin · Septembre-Octobre",
    costPerDay: "70-120 €",
    safety: "Sûr",
    weatherNow: "Soleil · 26°C",
    activities: ["Tapas à Séville", "Gaudí à Barcelone", "Baléares", "Camino de Santiago", "Flamenco à Grenade"],
    tags: ["Culture", "Mer", "Vin", "Fête"],
    currency: "EUR",
    language: "Espagnol",
    intro: "Andalousie brûlante, plages baléares, tapas et culture ibérique à chaque coin de rue.",
  },
  {
    code: "pt", name: "Portugal", emoji: "🇵🇹", center: [39.4, -8.2],
    cover: img("photo-1555881400-74d7acaacd8b"),
    gallery: [img("photo-1508739773434-c26b3d09e071"), img("photo-1518091043644-c1d4457512c6"), img("photo-1544015759-62db6a9bd3d8"), img("photo-1508515053963-70c7cc39dfb5")],
    bestTime: "Avril-Juin · Sept-Octobre",
    costPerDay: "60-100 €",
    safety: "Très sûr",
    weatherNow: "Soleil · 23°C",
    activities: ["Tram 28 à Lisbonne", "Surf à Ericeira", "Douro en train", "Açores randonnée", "Algarve criques"],
    tags: ["Mer", "Vin", "Ville", "Surf"],
    currency: "EUR",
    language: "Portugais",
    intro: "Azulejos, fado, océan Atlantique, vin de Porto et un rapport qualité-prix imbattable en Europe.",
  },
  {
    code: "mx", name: "Mexique", emoji: "🇲🇽", center: [23.6, -102.5],
    cover: img("photo-1518659526054-190340b32735"),
    gallery: [img("photo-1512813498716-3e640fed3f39"), img("photo-1518709911915-712d5fd04677"), img("photo-1526481280695-3c469b57e2b1"), img("photo-1533106418989-88406c7cc8ca")],
    bestTime: "Novembre-Avril",
    costPerDay: "45-80 €",
    safety: "Prudence",
    weatherNow: "Chaud · 28°C",
    activities: ["Cénotes Yucatán", "Ruines de Palenque", "Oaxaca cuisine", "Baja California surf", "Mexico City food tour"],
    tags: ["Plages", "Ruines", "Food", "Culture"],
    currency: "MXN",
    language: "Espagnol",
    intro: "Pyramides mayas, cénotes turquoise, désert, jungle et l'une des meilleures cuisines du monde.",
  },
  {
    code: "gr", name: "Grèce", emoji: "🇬🇷", center: [39, 22.5],
    cover: img("photo-1533105079780-92b9be482077"),
    gallery: [img("photo-1516483638261-f4dbaf036963"), img("photo-1543429776-2782fc8e1acd"), img("photo-1580500550469-4e1a1e26acdc"), img("photo-1509233725247-49e657c54213")],
    bestTime: "Mai-Juin · Septembre",
    costPerDay: "80-140 €",
    safety: "Très sûr",
    weatherNow: "Soleil · 27°C",
    activities: ["Santorin au coucher", "Cyclades en ferry", "Météores", "Crète du sud", "Athènes antique"],
    tags: ["Îles", "Antique", "Mer", "Village"],
    currency: "EUR",
    language: "Grec",
    intro: "Îles blanches et bleues, mythologie omniprésente, moussaka et plages désertes.",
  },
  {
    code: "ma", name: "Maroc", emoji: "🇲🇦", center: [31.8, -7.1],
    cover: img("photo-1489749798305-4fea3ae63d43"),
    gallery: [img("photo-1547999841-4c9e4f81cb2f"), img("photo-1523805009345-7448845a9e53"), img("photo-1517457373958-b7bdd4587205"), img("photo-1531761535209-180857e963b9")],
    bestTime: "Mars-Mai · Sept-Novembre",
    costPerDay: "40-75 €",
    safety: "Prudence",
    weatherNow: "Chaud · 30°C",
    activities: ["Nuit dans le désert", "Souks de Marrakech", "Chefchaouen bleue", "Vallée d'Ourika", "Surf à Taghazout"],
    tags: ["Désert", "Souks", "Culture", "Montagne"],
    currency: "MAD",
    language: "Arabe / Français",
    intro: "Médinas, dunes du Sahara, riads, thé à la menthe et Haut Atlas enneigé.",
  },
  {
    code: "is", name: "Islande", emoji: "🇮🇸", center: [64.9, -19],
    cover: img("photo-1504893524553-b855bce32c67"),
    gallery: [img("photo-1531168556467-80aace0d0144"), img("photo-1502786129293-79981df4e689"), img("photo-1520080591444-3e1af0d3e4b6"), img("photo-1490806843957-31f4c9a91c65")],
    bestTime: "Juin-Août (soleil de minuit) · Sept-Mars (aurores)",
    costPerDay: "160-260 €",
    safety: "Très sûr",
    weatherNow: "Frais · 8°C",
    activities: ["Aurores boréales", "Cercle d'or", "Glaciers du sud", "Blue Lagoon", "Trek à Landmannalaugar"],
    tags: ["Nature", "Aurores", "Volcans", "Cascades"],
    currency: "ISK",
    language: "Islandais",
    intro: "Volcans, glaciers, geysers et aurores boréales — un décor lunaire sur une île préservée.",
  },
];

export const COUNTRY_BY_CODE = new Map(COUNTRY_INFO.map((c) => [c.code, c]));
export const COUNTRY_BY_NAME = new Map(COUNTRY_INFO.map((c) => [c.name.toLowerCase(), c]));
