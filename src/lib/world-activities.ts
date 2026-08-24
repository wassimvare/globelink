import type { LiveCatalogItem } from "./live-catalog";
import { enrichSpecializedCatalogSource } from "./catalog-source-routing";
import { destinationLandmarkTitle } from "./destination-landmarks";
import { WORLD_MAP_HUBS } from "./world-map-hubs";

type ActivitySeed = {
  title: string;
  city: string;
  wikipedia?: string;
};

// Two additional, real attractions per country. The first attraction is always
// the representative landmark maintained in destination-landmarks.ts. This
// gives every country three useful fallbacks without inventing establishments,
// prices, ratings or availability.
const EXTRA_ACTIVITY_SEEDS = {
  "Afrique du Sud": [
    { title: "Robben Island", city: "Le Cap" },
    { title: "Parc national Kruger", city: "Mbombela" },
  ],
  Allemagne: [
    { title: "Château de Neuschwanstein", city: "Schwangau" },
    { title: "Cathédrale de Cologne", city: "Cologne" },
  ],
  "Arabie saoudite": [
    { title: "Hégra", city: "Al-'Ula" },
    { title: "Kingdom Centre", city: "Riyad" },
  ],
  Argentine: [
    { title: "Glacier Perito Moreno", city: "El Calafate" },
    { title: "Chutes d'Iguazú", city: "Puerto Iguazú" },
  ],
  Australie: [
    { title: "Grande Barrière de corail", city: "Cairns" },
    { title: "Uluru", city: "Yulara" },
  ],
  Autriche: [
    { title: "Hallstatt", city: "Hallstatt" },
    { title: "Cathédrale Saint-Étienne de Vienne", city: "Vienne" },
  ],
  Belgique: [
    { title: "Atomium", city: "Bruxelles" },
    { title: "Beffroi de Bruges", city: "Bruges" },
  ],
  Bolivie: [
    { title: "Lac Titicaca", city: "Copacabana" },
    { title: "Tiwanaku", city: "La Paz" },
  ],
  Brésil: [
    { title: "Mont du Pain de Sucre", city: "Rio de Janeiro" },
    { title: "Chutes d'Iguaçu", city: "Foz do Iguaçu" },
  ],
  Cambodge: [
    { title: "Bayon", city: "Siem Reap" },
    { title: "Palais royal de Phnom Penh", city: "Phnom Penh" },
  ],
  Canada: [
    { title: "Tour CN", city: "Toronto" },
    { title: "Parc national de Banff", city: "Banff" },
  ],
  Chili: [
    { title: "Île de Pâques", city: "Hanga Roa" },
    { title: "Quartier historique de Valparaíso", city: "Valparaíso" },
  ],
  Chine: [
    { title: "Cité interdite", city: "Pékin" },
    { title: "Armée de terre cuite", city: "Xi'an" },
  ],
  Colombie: [
    { title: "Monserrate", city: "Bogotá" },
    { title: "Guatapé", city: "Guatapé" },
  ],
  "Corée du Sud": [
    { title: "Bukchon Hanok Village", city: "Séoul" },
    { title: "Île de Jeju", city: "Jeju" },
  ],
  "Costa Rica": [
    { title: "Parc national Manuel-Antonio", city: "Quepos" },
    { title: "Réserve biologique de Monteverde", city: "Monteverde" },
  ],
  Cuba: [
    { title: "Malecón", city: "La Havane" },
    { title: "Vallée de Viñales", city: "Viñales" },
  ],
  Danemark: [
    { title: "Nyhavn", city: "Copenhague" },
    { title: "Jardins de Tivoli", city: "Copenhague" },
  ],
  Espagne: [
    { title: "Alhambra", city: "Grenade" },
    { title: "Musée du Prado", city: "Madrid" },
  ],
  Finlande: [
    { title: "Suomenlinna", city: "Helsinki" },
    { title: "Village du Père Noël", city: "Rovaniemi" },
  ],
  France: [
    { title: "Musée du Louvre", city: "Paris" },
    { title: "Mont-Saint-Michel", city: "Le Mont-Saint-Michel" },
  ],
  Ghana: [
    { title: "Château de Cape Coast", city: "Cape Coast" },
    { title: "Parc national de Kakum", city: "Cape Coast" },
  ],
  Grèce: [
    { title: "Oia", city: "Santorin" },
    { title: "Météores", city: "Kalambaka" },
  ],
  "Hong Kong": [
    { title: "Victoria Peak", city: "Hong Kong" },
    { title: "Grand Bouddha de Tian Tan", city: "Hong Kong" },
  ],
  Hongrie: [
    { title: "Château de Buda", city: "Budapest" },
    { title: "Thermes Széchenyi", city: "Budapest" },
  ],
  Inde: [
    { title: "Fort d'Amber", city: "Jaipur" },
    { title: "Ghats de Varanasi", city: "Varanasi" },
  ],
  Indonésie: [
    { title: "Borobudur", city: "Magelang" },
    { title: "Parc national de Komodo", city: "Labuan Bajo" },
  ],
  Irlande: [
    { title: "Guinness Storehouse", city: "Dublin" },
    { title: "Anneau du Kerry", city: "Killarney" },
  ],
  Islande: [
    { title: "Lagon bleu", city: "Grindavík" },
    { title: "Parc national de Þingvellir", city: "Þingvellir" },
  ],
  Italie: [
    { title: "Place Saint-Marc", city: "Venise" },
    { title: "Tour de Pise", city: "Pise" },
  ],
  Japon: [
    { title: "Fushimi Inari-taisha", city: "Kyoto" },
    { title: "Sensō-ji", city: "Tokyo" },
  ],
  Jordanie: [
    { title: "Wadi Rum", city: "Aqaba" },
    { title: "Mer Morte", city: "Suweimeh" },
  ],
  Kenya: [
    { title: "Réserve nationale du Masai Mara", city: "Narok" },
    { title: "Giraffe Centre", city: "Nairobi" },
  ],
  Malaisie: [
    { title: "Grottes de Batu", city: "Kuala Lumpur" },
    { title: "George Town", city: "Penang" },
  ],
  Maroc: [
    { title: "Place Jemaa el-Fna", city: "Marrakech" },
    { title: "Chefchaouen", city: "Chefchaouen" },
  ],
  Mexique: [
    { title: "Teotihuacan", city: "Mexico" },
    { title: "Musée Frida-Kahlo", city: "Mexico" },
  ],
  Nigeria: [
    { title: "Lekki Conservation Centre", city: "Lagos" },
    { title: "Musée national du Nigeria", city: "Lagos" },
  ],
  Norvège: [
    { title: "Bryggen", city: "Bergen" },
    { title: "Preikestolen", city: "Stavanger" },
  ],
  "Nouvelle-Zélande": [
    { title: "Hobbiton Movie Set", city: "Matamata" },
    { title: "Parc national de Tongariro", city: "Whakapapa" },
  ],
  Népal: [
    { title: "Stupa de Bodnath", city: "Katmandou" },
    { title: "Place du Darbâr de Katmandou", city: "Katmandou" },
  ],
  Oman: [
    { title: "Wadi Shab", city: "Tiwi" },
    { title: "Fort de Nizwa", city: "Nizwa" },
  ],
  Panama: [
    { title: "Casco Viejo de Panama", city: "Panama" },
    { title: "Archipel de San Blas", city: "Guna Yala" },
  ],
  "Pays-Bas": [
    { title: "Rijksmuseum Amsterdam", city: "Amsterdam" },
    { title: "Moulins de Kinderdijk", city: "Kinderdijk" },
  ],
  Philippines: [
    { title: "Rizières de Banaue", city: "Banaue" },
    { title: "Intramuros", city: "Manille" },
  ],
  Pologne: [
    { title: "Mine de sel de Wieliczka", city: "Wieliczka" },
    { title: "Vieille ville de Varsovie", city: "Varsovie" },
  ],
  "Porto Rico": [
    { title: "Forêt nationale d'El Yunque", city: "Río Grande" },
    { title: "Castillo San Felipe del Morro", city: "San Juan" },
  ],
  Portugal: [
    { title: "Palais national de Pena", city: "Sintra" },
    { title: "Ribeira de Porto", city: "Porto" },
  ],
  Pérou: [
    { title: "Lac Titicaca", city: "Puno" },
    { title: "Lignes de Nazca", city: "Nazca" },
  ],
  Qatar: [
    { title: "Souq Waqif", city: "Doha" },
    { title: "Musée national du Qatar", city: "Doha" },
  ],
  Roumanie: [
    { title: "Palais du Parlement", city: "Bucarest" },
    { title: "Château de Peleș", city: "Sinaia" },
  ],
  "Royaume-Uni": [
    { title: "Tour de Londres", city: "Londres" },
    { title: "Château d'Édimbourg", city: "Édimbourg" },
  ],
  Singapour: [
    { title: "Gardens by the Bay", city: "Singapour" },
    { title: "Merlion", city: "Singapour" },
  ],
  "Sri Lanka": [
    { title: "Temple de la Dent", city: "Kandy" },
    { title: "Fort de Galle", city: "Galle" },
  ],
  Suisse: [
    { title: "Jungfraujoch", city: "Interlaken" },
    { title: "Château de Chillon", city: "Veytaux" },
  ],
  Suède: [
    { title: "Musée Vasa", city: "Stockholm" },
    { title: "Gamla stan", city: "Stockholm" },
  ],
  Sénégal: [
    { title: "Île de Gorée", city: "Dakar" },
    { title: "Lac Rose", city: "Dakar" },
  ],
  Tanzanie: [
    { title: "Parc national du Serengeti", city: "Arusha" },
    { title: "Stone Town", city: "Zanzibar" },
  ],
  Taïwan: [
    { title: "Parc national de Taroko", city: "Hualien" },
    { title: "Mémorial de Tchang Kaï-chek", city: "Taipei" },
  ],
  Tchéquie: [
    { title: "Château de Prague", city: "Prague" },
    { title: "Horloge astronomique de Prague", city: "Prague" },
  ],
  Thaïlande: [
    { title: "Grand Palais de Bangkok", city: "Bangkok" },
    { title: "Îles Phi Phi", city: "Krabi" },
  ],
  Tunisie: [
    { title: "Amphithéâtre d'El Jem", city: "El Jem" },
    { title: "Site archéologique de Carthage", city: "Carthage" },
  ],
  Turquie: [
    { title: "Cappadoce", city: "Göreme" },
    { title: "Pamukkale", city: "Denizli" },
  ],
  Uruguay: [
    { title: "Colonia del Sacramento", city: "Colonia del Sacramento" },
    { title: "La Mano de Punta del Este", city: "Punta del Este" },
  ],
  Vietnam: [
    { title: "Vieille ville de Hội An", city: "Hội An" },
    { title: "Temple de la Littérature de Hanoï", city: "Hanoï" },
  ],
  Égypte: [
    { title: "Temple de Karnak", city: "Louxor" },
    { title: "Temples d'Abou Simbel", city: "Abou Simbel" },
  ],
  "Émirats arabes unis": [
    { title: "Grande Mosquée Cheikh Zayed", city: "Abu Dhabi" },
    { title: "Louvre Abou Dabi", city: "Abu Dhabi" },
  ],
  Équateur: [
    { title: "Îles Galápagos", city: "Puerto Ayora" },
    { title: "Centre historique de Quito", city: "Quito" },
  ],
  "États-Unis": [
    { title: "Grand Canyon", city: "Grand Canyon Village" },
    { title: "Pont du Golden Gate", city: "San Francisco" },
  ],
  Éthiopie: [
    { title: "Parc national du Simien", city: "Debark" },
    { title: "Fasil Ghebbi", city: "Gondar" },
  ],
} satisfies Record<string, readonly [ActivitySeed, ActivitySeed]>;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string) {
  return (
    normalize(value)
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "") || "activite"
  );
}

function wikipediaReference(title: string) {
  return `fr:${title}`;
}

function wikipediaUrl(reference: string) {
  const title = reference.replace(/^[a-z-]{2,12}:/i, "");
  return `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function activityItem(country: string, seed: ActivitySeed, position: number): LiveCatalogItem {
  const wikipedia = seed.wikipedia ?? wikipediaReference(seed.title);
  const externalId = `${slugify(country)}:${position + 1}:${slugify(seed.title)}`;
  return enrichSpecializedCatalogSource({
    id: `curated-activity-${externalId}`,
    provider: "globelink-curated",
    external_id: externalId,
    kind: "activity",
    slug: `${slugify(seed.title)}-gl-${slugify(country)}`,
    title: seed.title,
    description: `Lieu réel et emblématique à découvrir à ${seed.city}, ${country}. Vérifie les horaires et les conditions d'accès avant ta visite.`,
    category: "incontournable",
    city: seed.city,
    country,
    country_code: null,
    latitude: null,
    longitude: null,
    image_url: null,
    source_url: wikipediaUrl(wikipedia),
    booking_url: null,
    price_amount: null,
    currency: null,
    price_text: "Voir les informations",
    rating: null,
    reviews_count: 0,
    opening_hours: null,
    tags: {
      wikipedia,
      curated_country_activity: true,
      verified_real_place: true,
    },
    fetched_at: "2026-08-18T00:00:00.000Z",
    valid_until: null,
  });
}

const COUNTRIES = Array.from(new Set(WORLD_MAP_HUBS.map((hub) => hub.country)));
const BY_COUNTRY = new Map<string, LiveCatalogItem[]>();

for (const country of COUNTRIES) {
  const extras = EXTRA_ACTIVITY_SEEDS[country as keyof typeof EXTRA_ACTIVITY_SEEDS] ?? [];
  const primaryCity = WORLD_MAP_HUBS.find((hub) => hub.country === country)?.city ?? country;
  const primary: ActivitySeed = {
    title: destinationLandmarkTitle(country),
    city: primaryCity,
  };
  BY_COUNTRY.set(
    normalize(country),
    [primary, ...extras].map((seed, index) => activityItem(country, seed, index)),
  );
}

export const CURATED_ACTIVITY_COUNTRIES = COUNTRIES;
export const ALL_CURATED_WORLD_ACTIVITIES = COUNTRIES.flatMap(
  (country) => BY_COUNTRY.get(normalize(country)) ?? [],
);

export function curatedActivitiesForCountry(country?: string | null) {
  return [...(BY_COUNTRY.get(normalize(String(country ?? ""))) ?? [])];
}

export function curatedActivityBySlug(slug?: string | null) {
  const normalizedSlug = String(slug ?? "").trim();
  return ALL_CURATED_WORLD_ACTIVITIES.find((activity) => activity.slug === normalizedSlug) ?? null;
}

export function representativeWorldActivities() {
  return COUNTRIES.map((country) => BY_COUNTRY.get(normalize(country))?.[0]).filter(
    (activity): activity is LiveCatalogItem => !!activity,
  );
}

export function dailyWorldActivitySelection(limit = 24, date = new Date()) {
  const representatives = representativeWorldActivities();
  if (!representatives.length) return [];
  const day = Math.floor(date.getTime() / 86_400_000);
  const start = Math.abs(day * 17) % representatives.length;
  return Array.from(
    { length: Math.min(limit, representatives.length) },
    (_, index) => representatives[(start + index * 11) % representatives.length],
  ).filter(
    (activity, index, all) => all.findIndex((candidate) => candidate.id === activity.id) === index,
  );
}
