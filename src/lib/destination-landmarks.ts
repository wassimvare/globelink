// Curated representative landmarks for every country currently exposed by
// GlobeLink. These titles are resolved through Wikipedia/Wikimedia so the
// destination grid never mistakes a flag, a map or a generic landscape for a
// representative photograph of the country.

function normalizeDestination(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const LANDMARK_BY_DESTINATION = new Map<string, string>(
  Object.entries({
    // Amérique du Nord et Caraïbes
    Canada: "Chutes du Niagara",
    "États-Unis": "Statue de la Liberté",
    Mexique: "Chichén Itzá",
    Cuba: "Capitole de La Havane",
    "Porto Rico": "Vieux San Juan",
    Panama: "Canal de Panama",
    "Costa Rica": "Volcan Arenal",

    // Amérique du Sud
    Colombie: "Carthagène des Indes",
    Équateur: "Mitad del Mundo",
    Pérou: "Machu Picchu",
    Bolivie: "Salar d'Uyuni",
    Chili: "Parc national Torres del Paine",
    Argentine: "Obélisque de Buenos Aires",
    Uruguay: "Palais Salvo",
    Brésil: "Christ Rédempteur",

    // Europe
    Islande: "Jökulsárlón",
    Irlande: "Falaises de Moher",
    "Royaume-Uni": "Big Ben",
    Portugal: "Tour de Belém",
    Espagne: "Sagrada Família",
    France: "Tour Eiffel",
    Suisse: "Cervin",
    Belgique: "Grand-Place de Bruxelles",
    "Pays-Bas": "Canaux d'Amsterdam",
    Allemagne: "Porte de Brandebourg",
    Danemark: "La Petite Sirène",
    Norvège: "Geirangerfjord",
    Suède: "Hôtel de ville de Stockholm",
    Finlande: "Cathédrale luthérienne d'Helsinki",
    Pologne: "Château du Wawel",
    Tchéquie: "Pont Charles",
    Autriche: "Château de Schönbrunn",
    Hongrie: "Parlement hongrois",
    Roumanie: "Château de Bran",
    Italie: "Colisée",
    Grèce: "Acropole d'Athènes",
    Turquie: "Sainte-Sophie (Constantinople)",

    // Afrique
    Maroc: "Mosquée Hassan-II",
    Tunisie: "Sidi Bou Saïd",
    Égypte: "Pyramides de Gizeh",
    Sénégal: "Monument de la Renaissance africaine",
    Ghana: "Place de l'Indépendance (Accra)",
    Nigeria: "Zuma Rock",
    Éthiopie: "Églises rupestres de Lalibela",
    Kenya: "Parc national d'Amboseli",
    Tanzanie: "Kilimandjaro",
    "Afrique du Sud": "Montagne de la Table",

    // Moyen-Orient
    "Émirats arabes unis": "Burj Khalifa",
    Qatar: "Musée d'Art islamique de Doha",
    "Arabie saoudite": "Kaaba",
    Jordanie: "Pétra",
    Oman: "Grande Mosquée du Sultan Qabus",

    // Asie
    Inde: "Taj Mahal",
    Népal: "Everest",
    "Sri Lanka": "Sigirîya",
    Thaïlande: "Wat Arun",
    Vietnam: "Baie d'Ha Long",
    Cambodge: "Angkor Vat",
    Malaisie: "Tours Petronas",
    Singapour: "Marina Bay Sands",
    Indonésie: "Tanah Lot",
    Philippines: "Chocolate Hills",
    "Hong Kong": "Victoria Harbour",
    Taïwan: "Taipei 101",
    Chine: "Grande Muraille",
    "Corée du Sud": "Gyeongbokgung",
    Japon: "Mont Fuji",

    // Océanie
    Australie: "Opéra de Sydney",
    "Nouvelle-Zélande": "Milford Sound",

    // Destinations urbaines/insulaires fréquemment stockées séparément
    Bali: "Tanah Lot",
    Paris: "Tour Eiffel",
    "New York": "Statue de la Liberté",
    "Le Caire": "Pyramides de Gizeh",
    Tunis: "Sidi Bou Saïd",
    Rome: "Colisée",
    Athènes: "Acropole d'Athènes",
    Tokyo: "Mont Fuji",
    Sydney: "Opéra de Sydney",
  }).map(([destination, landmark]) => [normalizeDestination(destination), landmark]),
);

export function destinationLandmarkTitle(destination?: string | null) {
  const raw = String(destination ?? "").trim();
  if (!raw) return "";
  return LANDMARK_BY_DESTINATION.get(normalizeDestination(raw)) ?? raw;
}

export function hasCuratedDestinationLandmark(destination?: string | null) {
  return LANDMARK_BY_DESTINATION.has(normalizeDestination(String(destination ?? "")));
}
