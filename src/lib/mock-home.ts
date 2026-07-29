// Mock data to make the homepage feel lively. All images from Unsplash (source URLs).
const img = (id: string, w = 800, h = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const TRENDING_DESTINATIONS = [
  { name: "Kyoto", country: "Japon", posts: 1240, image: img("1493976040374-85c8e12f0c0e", 800, 1000), tag: "Culture" },
  { name: "Lisbonne", country: "Portugal", posts: 892, image: img("1555881400-74d7acaacd8b", 800, 1000), tag: "Citytrip" },
  { name: "Bali", country: "Indonésie", posts: 2103, image: img("1537996194471-e657df975ab4", 800, 1000), tag: "Plage" },
  { name: "Marrakech", country: "Maroc", posts: 651, image: img("1597212618440-806262de4f6b", 800, 1000), tag: "Désert" },
  { name: "Reykjavik", country: "Islande", posts: 478, image: img("1504829857797-ddff29c27927", 800, 1000), tag: "Nature" },
  { name: "Cape Town", country: "Afrique du Sud", posts: 733, image: img("1580060839134-75a5edca2e99", 800, 1000), tag: "Aventure" },
  { name: "Séoul", country: "Corée du Sud", posts: 1108, image: img("1517154421773-0529f29ea451", 800, 1000), tag: "Lifestyle" },
  { name: "Istanbul", country: "Turquie", posts: 967, image: img("1524231757912-21f4fe3a7200", 800, 1000), tag: "Culture" },
  { name: "Lofoten", country: "Norvège", posts: 409, image: img("1520769669658-f07657f5a307", 800, 1000), tag: "Grand nord" },
  { name: "Mexico", country: "Mexique", posts: 875, image: img("1518659526054-190340b32735", 800, 1000), tag: "Foodie" },
  { name: "Zanzibar", country: "Tanzanie", posts: 592, image: img("1540202404-a2f29016b523", 800, 1000), tag: "Îles" },
  { name: "Queenstown", country: "Nouvelle-Zélande", posts: 538, image: img("1469521669194-babb45599def", 800, 1000), tag: "Outdoor" },
];

export const PHOTOS_OF_THE_DAY = [
  { author: "elena.wanders", location: "Santorin, Grèce", likes: 3421, image: img("1533105079780-92b9be482077", 900, 1100) },
  { author: "lucas.travels", location: "Patagonie, Chili", likes: 2870, image: img("1483347756197-71ef80e95f73", 900, 900) },
  { author: "mika_globe", location: "Ha Long Bay, Vietnam", likes: 4102, image: img("1528127269322-539801943592", 900, 700) },
  { author: "sofia_ontheroad", location: "Petra, Jordanie", likes: 1988, image: img("1544015759-62a86c26af74", 900, 800) },
];

export const DEALS_OF_THE_WEEK = [
  { title: "Vol Paris → Tokyo", price: "389 €", by: "Skyscanner", image: img("1503899036084-c55cdd92da26", 800, 500), badge: "-42%" },
  { title: "7 nuits à Bali all-in", price: "699 €", by: "TUI", image: img("1518548419970-58e3b4079ab2", 800, 500), badge: "Été 2026" },
  { title: "City break Lisbonne 4j", price: "229 €", by: "Voyage Privé", image: img("1513735492246-483525079686", 800, 500), badge: "Coup de cœur" },
];

export const NEARBY_TRAVELERS = [
  {
    username: "juliette.p",
    displayName: "Juliette Pernaut",
    age: 27,
    city: "Paris 11e",
    km: 2,
    avatar: img("1544005313-94ddf0286df2", 400, 400),
    next: "→ Bangkok en mars",
    personality: ["Curieuse", "Solaire", "Slow travel"],
    interests: ["Street food", "Marchés locaux", "Photo argentique", "Yoga"],
    bio: "Graphiste nomade, je pars 4 mois par an. Amoureuse de l'Asie du Sud-Est, toujours en quête d'une bonne adresse de nouilles.",
    countries: 32,
    followers: 1240,
    voice: "https://actions.google.com/sounds/v1/ambiences/cafe_ambience.ogg",
    videos: [img("1533105079780-92b9be482077", 800, 500), img("1528127269322-539801943592", 800, 500)],
    gallery: [
      img("1533105079780-92b9be482077", 600, 600),
      img("1528127269322-539801943592", 600, 600),
      img("1493976040374-85c8e12f0c0e", 600, 600),
      img("1555881400-74d7acaacd8b", 600, 600),
      img("1544015759-62a86c26af74", 600, 600),
      img("1483347756197-71ef80e95f73", 600, 600),
    ],
  },
  {
    username: "amine.k",
    displayName: "Amine Khelifi",
    age: 31,
    city: "Paris 20e",
    km: 4,
    avatar: img("1500648767791-00dcc994a43e", 400, 400),
    next: "Rentre du Pérou",
    personality: ["Aventurier", "Grand marcheur", "Passionné d'histoire"],
    interests: ["Trekking", "Archéologie", "Café de spécialité", "Vinyles"],
    bio: "Prof d'histoire-géo en année sabbatique. J'ai traversé les Andes en 3 mois, prochaine étape : la route de la soie.",
    countries: 47,
    followers: 3210,
    voice: "https://actions.google.com/sounds/v1/ambiences/mountain_stream.ogg",
    videos: [img("1526392060635-9d6019884377", 800, 500), img("1516426122078-c23e76319801", 800, 500)],
    gallery: [
      img("1526392060635-9d6019884377", 600, 600),
      img("1580060839134-75a5edca2e99", 600, 600),
      img("1516426122078-c23e76319801", 600, 600),
      img("1597212618440-806262de4f6b", 600, 600),
      img("1504829857797-ddff29c27927", 600, 600),
      img("1469854523086-cc02fe5d8800", 600, 600),
    ],
  },
  {
    username: "chloe.m",
    displayName: "Chloé Marchetti",
    age: 24,
    city: "Boulogne",
    km: 6,
    avatar: img("1438761681033-6461ffad8d80", 400, 400),
    next: "→ Islande en avril",
    personality: ["Contemplative", "Écolo", "Photographe"],
    interests: ["Grand nord", "Randonnée", "Astrophoto", "Céramique"],
    bio: "Photographe de paysages. Je collectionne les levers de soleil au-dessus du 60e parallèle.",
    countries: 18,
    followers: 890,
    voice: "https://actions.google.com/sounds/v1/ambiences/arctic_wind.ogg",
    videos: [img("1504829857797-ddff29c27927", 800, 500), img("1469854523086-cc02fe5d8800", 800, 500)],
    gallery: [
      img("1504829857797-ddff29c27927", 600, 600),
      img("1469854523086-cc02fe5d8800", 600, 600),
      img("1483347756197-71ef80e95f73", 600, 600),
      img("1518548419970-58e3b4079ab2", 600, 600),
      img("1544551763-46a013bb70d5", 600, 600),
      img("1533105079780-92b9be482077", 600, 600),
    ],
  },
  {
    username: "thomas.r",
    displayName: "Thomas Ricard",
    age: 34,
    city: "Vincennes",
    km: 8,
    avatar: img("1507003211169-0a1dd7228f2d", 400, 400),
    next: "Vit à Lisbonne",
    personality: ["Épicurien", "Sociable", "Digital nomad"],
    interests: ["Surf", "Vins nature", "Coworking", "Fado"],
    bio: "Développeur freelance basé entre Lisbonne et Paris. J'organise des retraites tech + surf sur la côte alentejane.",
    countries: 26,
    followers: 2015,
    voice: "https://actions.google.com/sounds/v1/ambiences/ocean_waves.ogg",
    videos: [img("1555881400-74d7acaacd8b", 800, 500), img("1513735492246-483525079686", 800, 500)],
    gallery: [
      img("1555881400-74d7acaacd8b", 600, 600),
      img("1513735492246-483525079686", 600, 600),
      img("1503899036084-c55cdd92da26", 600, 600),
      img("1559847844-5315695dadae", 600, 600),
      img("1537996194471-e657df975ab4", 600, 600),
      img("1518548419970-58e3b4079ab2", 600, 600),
    ],
  },
];

export type MockTraveler = (typeof NEARBY_TRAVELERS)[number];

export function getMockTraveler(username: string): MockTraveler | undefined {
  return NEARBY_TRAVELERS.find((t) => t.username === username);
}


export const POPULAR_ACTIVITIES = [
  { slug: "plongee-raies-manta", title: "Plongée avec les raies manta", place: "Nusa Penida, Bali", image: img("1544551763-46a013bb70d5", 700, 900), rating: 4.9, price: "85 €", duration: "1/2 journée", description: "Plonge en apnée ou en bouteille avec les majestueuses raies manta dans les eaux cristallines de Nusa Penida. Guide certifié, matériel inclus, petit-déj sur le bateau." },
  { slug: "trek-machu-picchu", title: "Trek jusqu'au Machu Picchu", place: "Cusco, Pérou", image: img("1526392060635-9d6019884377", 700, 900), rating: 4.8, price: "620 €", duration: "4 jours", description: "L'Inca Trail original avec porteurs, campements et petit-déj face aux nuages. Arrivée à la Porte du Soleil au lever du jour — inoubliable." },
  { slug: "aurores-boreales-tromso", title: "Nuit sous les aurores boréales", place: "Tromsø, Norvège", image: img("1483347756197-71ef80e95f73", 700, 900), rating: 4.9, price: "220 €", duration: "1 nuit", description: "Chasse aux aurores en minibus avec guide photo, combinaisons chaudes fournies, feu de camp et boissons chaudes sous le ciel étoilé." },
  { slug: "safari-serengeti", title: "Safari dans le Serengeti", place: "Tanzanie", image: img("1516426122078-c23e76319801", 700, 900), rating: 4.7, price: "1 400 €", duration: "3 jours", description: "Grande migration, big five, lodge de luxe en pleine savane. Guide swahili francophone et pique-nique dans la brousse." },
  { slug: "cours-cuisine-thai", title: "Cours de cuisine thaï", place: "Chiang Mai, Thaïlande", image: img("1559847844-5315695dadae", 700, 900), rating: 4.8, price: "35 €", duration: "4 h", description: "Visite du marché local, 5 plats préparés avec un chef, dégustation et livret de recettes. Options végé/vegan disponibles." },
  { slug: "kayak-fjords-milford-sound", title: "Kayak dans les fjords", place: "Milford Sound, NZ", image: img("1469854523086-cc02fe5d8800", 700, 900), rating: 4.9, price: "160 €", duration: "1 journée", description: "Pagaie au pied de cascades géantes, phoques et dauphins, déjeuner sur une plage sauvage. Débutants bienvenus, tout le matos fourni." },
  { slug: "montgolfiere-cappadoce", title: "Lever de soleil en montgolfière", place: "Cappadoce, Turquie", image: img("1528181304800-259b08848526", 700, 900), rating: 4.8, price: "190 €", duration: "3 h", description: "Survole les cheminées de fées au lever du soleil, avec transfert, briefing et petit-déjeuner léger inclus." },
  { slug: "street-food-seoul", title: "Food tour de nuit à Séoul", place: "Séoul, Corée du Sud", image: img("1504674900247-0877df9cc836", 700, 900), rating: 4.8, price: "58 €", duration: "3 h 30", description: "Découvre les marchés, les barbecue coréens et les petites adresses locales avec un guide passionné." },
  { slug: "surf-ericeira", title: "Session surf sur la côte", place: "Ericeira, Portugal", image: img("1502680390469-be75c86b636f", 700, 900), rating: 4.7, price: "45 €", duration: "2 h", description: "Cours adapté à ton niveau, planche et combinaison incluses, sur l'un des meilleurs spots européens." },
  { slug: "cenotes-yucatan", title: "Exploration des cénotes", place: "Yucatán, Mexique", image: img("1518509562904-e7ef99cdcc86", 700, 900), rating: 4.9, price: "72 €", duration: "1 journée", description: "Baignade et snorkeling dans plusieurs cénotes, déjeuner local et transport depuis la ville inclus." },
  { slug: "velo-riziere-ubud", title: "Vélo dans les rizières", place: "Ubud, Indonésie", image: img("1518548419970-58e3b4079ab2", 700, 900), rating: 4.7, price: "38 €", duration: "1/2 journée", description: "Parcours tranquille entre villages, plantations et rizières avec guide local et pause dégustation." },
  { slug: "sauna-fjord-oslo", title: "Sauna flottant dans le fjord", place: "Oslo, Norvège", image: img("1520769669658-f07657f5a307", 700, 900), rating: 4.8, price: "32 €", duration: "1 h 30", description: "Alterner sauna chaud et baignade dans le fjord, au cœur du front de mer moderne d'Oslo." },
];

export const COMMUNITY_QUESTIONS = [
  { slug: "japon-printemps-ou-automne", q: "Vaut-il mieux visiter le Japon au printemps ou en automne ?", author: "marie.v", country: "Japon", answers: 47, votes: 128 },
  { slug: "grece-iles-sans-se-ruiner", q: "Comment se déplacer entre les îles en Grèce sans se ruiner ?", author: "hugo_backpack", country: "Grèce", answers: 32, votes: 89 },
  { slug: "colombie-voyager-seule-2026", q: "Est-ce sûr de voyager seule en Colombie en 2026 ?", author: "camille.solo", country: "Colombie", answers: 61, votes: 204 },
  { slug: "safari-tanzanie-meilleure-periode", q: "Meilleure période pour un safari en Tanzanie ?", author: "paul.explore", country: "Tanzanie", answers: 24, votes: 76 },
  { slug: "bali-quartier-calme", q: "Quel quartier choisir à Bali pour être au calme sans être isolé ?", author: "ines.nomade", country: "Indonésie", answers: 39, votes: 117 },
  { slug: "coree-carte-transport", q: "Quelle carte de transport prendre pour deux semaines en Corée du Sud ?", author: "leo.asia", country: "Corée du Sud", answers: 18, votes: 66 },
  { slug: "islande-van-ou-voiture", q: "Islande : van aménagé ou voiture avec hôtels pour un premier road trip ?", author: "nina.north", country: "Islande", answers: 42, votes: 151 },
  { slug: "mexique-yucatan-itineraire", q: "Quel itinéraire de 10 jours dans le Yucatán sans courir partout ?", author: "sam.route", country: "Mexique", answers: 28, votes: 93 },
  { slug: "lisbonne-budget-weekend", q: "Quel budget réaliste pour un long week-end à Lisbonne ?", author: "emma.city", country: "Portugal", answers: 35, votes: 104 },
  { slug: "norvege-aurores-sans-voiture", q: "Peut-on voir les aurores en Norvège sans louer de voiture ?", author: "yassine.globe", country: "Norvège", answers: 31, votes: 122 },
];
