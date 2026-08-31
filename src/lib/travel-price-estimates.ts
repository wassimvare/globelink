export type TravelEstimateCategory = "hotel" | "activity" | "restaurant" | "transport" | "general";

export type TravelPriceEstimateContext = {
  query?: string | null;
  city?: string | null;
  country?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  travelers?: number | null;
};

type PriceBand = readonly [number, number];
type CostProfile = {
  label: string;
  hotel: PriceBand;
  meal: PriceBand;
  activity: PriceBand;
  publicActivity: PriceBand;
  localTransport: PriceBand;
  transfer: PriceBand;
};

const COST_PROFILES = {
  economy: {
    label: "coût local plutôt économique",
    hotel: [45, 90],
    meal: [8, 20],
    activity: [5, 25],
    publicActivity: [0, 5],
    localTransport: [4, 12],
    transfer: [10, 35],
  },
  standard: {
    label: "coût local intermédiaire",
    hotel: [80, 160],
    meal: [15, 35],
    activity: [10, 45],
    publicActivity: [0, 10],
    localTransport: [8, 20],
    transfer: [20, 60],
  },
  premium: {
    label: "coût local élevé",
    hotel: [140, 280],
    meal: [25, 60],
    activity: [20, 75],
    publicActivity: [0, 15],
    localTransport: [12, 35],
    transfer: [35, 100],
  },
} satisfies Record<string, CostProfile>;

const ECONOMY_COUNTRIES = new Set([
  "albanie",
  "albania",
  "algeria",
  "algerie",
  "bolivia",
  "bolivie",
  "bosnia and herzegovina",
  "bosnie herzegovine",
  "bulgaria",
  "bulgarie",
  "cambodia",
  "cambodge",
  "colombia",
  "colombie",
  "egypt",
  "egypte",
  "india",
  "inde",
  "indonesia",
  "indonesie",
  "laos",
  "maroc",
  "morocco",
  "nepal",
  "north macedonia",
  "macedoine du nord",
  "peru",
  "perou",
  "philippines",
  "serbia",
  "serbie",
  "sri lanka",
  "thailand",
  "thailande",
  "tunisia",
  "tunisie",
  "turkey",
  "turquie",
  "vietnam",
]);

const PREMIUM_COUNTRIES = new Set([
  "australia",
  "australie",
  "canada",
  "denmark",
  "danemark",
  "emirats arabes unis",
  "finland",
  "finlande",
  "iceland",
  "islande",
  "ireland",
  "irlande",
  "luxembourg",
  "monaco",
  "new zealand",
  "nouvelle zelande",
  "norway",
  "norvege",
  "qatar",
  "singapore",
  "singapour",
  "sweden",
  "suede",
  "switzerland",
  "suisse",
  "united arab emirates",
  "united kingdom",
  "royaume uni",
  "united states",
  "etats unis",
]);

const PREMIUM_CITIES = new Set([
  "amsterdam",
  "copenhague",
  "copenhagen",
  "dubai",
  "geneva",
  "geneve",
  "london",
  "londres",
  "new york",
  "oslo",
  "paris",
  "reykjavik",
  "san francisco",
  "singapore",
  "singapour",
  "venice",
  "venise",
  "zurich",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function travelerCount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(50, Math.max(1, Math.round(number))) : 1;
}

function explicitRoomCount(query: unknown) {
  const match = normalize(query).match(/\b(\d{1,2})\s*(?:chambre|chambres|room|rooms)\b/);
  return match ? Math.max(1, Math.min(20, Number(match[1]))) : null;
}

function roomCount(context: TravelPriceEstimateContext) {
  return (
    explicitRoomCount(context.query) ?? Math.max(1, Math.ceil(travelerCount(context.travelers) / 2))
  );
}

function vehicleCount(context: TravelPriceEstimateContext) {
  return Math.max(1, Math.ceil(travelerCount(context.travelers) / 3));
}

function nightCount(context: TravelPriceEstimateContext) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(context.startsOn ?? ""))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(context.endsOn ?? ""))) return null;
  const start = Date.parse(`${context.startsOn}T12:00:00Z`);
  const end = Date.parse(`${context.endsOn}T12:00:00Z`);
  const nights = Math.round((end - start) / 86_400_000);
  return Number.isFinite(nights) && nights > 0 && nights <= 90 ? nights : null;
}

function costProfile(context: TravelPriceEstimateContext): CostProfile {
  const city = normalize(context.city);
  const country = normalize(context.country);
  if (PREMIUM_CITIES.has(city) || PREMIUM_COUNTRIES.has(country)) return COST_PROFILES.premium;
  if (ECONOMY_COUNTRIES.has(country)) return COST_PROFILES.economy;
  return COST_PROFILES.standard;
}

function multiplyBand(band: PriceBand, count: number): PriceBand {
  return [Math.round(band[0] * count), Math.round(band[1] * count)];
}

function range(band: PriceBand) {
  return `${band[0]}–${band[1]}`;
}

function isLikelyPublicActivity(text: unknown) {
  return /\b(?:balade|marche|medina|parc|plage|promenade|quartier|remparts|vieille ville)\b/.test(
    normalize(text),
  );
}

function isTransfer(text: unknown) {
  return /\b(?:aeroport|airport|chauffeur|navette|taxi|transfert)\b/.test(normalize(text));
}

export function formatTravelPriceEstimate(
  category: Exclude<TravelEstimateCategory, "general">,
  context: TravelPriceEstimateContext,
  itemText = "",
) {
  const profile = costProfile(context);
  const travelers = travelerCount(context.travelers);

  if (category === "hotel") {
    const rooms = roomCount(context);
    const total = multiplyBand(profile.hotel, rooms);
    return `estimation IA+ : env. ${range(profile.hotel)} €/chambre/nuit · env. ${range(total)} € total/nuit pour ${rooms} chambre${rooms > 1 ? "s" : ""}`;
  }

  if (category === "restaurant") {
    const total = multiplyBand(profile.meal, travelers);
    return `estimation IA+ : env. ${range(profile.meal)} €/pers. · env. ${range(total)} € total pour ${travelers} pers.`;
  }

  if (category === "transport" && isTransfer(itemText)) {
    const vehicles = vehicleCount(context);
    const total = multiplyBand(profile.transfer, vehicles);
    return `estimation IA+ : env. ${range(profile.transfer)} €/véhicule · env. ${range(total)} € total pour ${vehicles} véhicule${vehicles > 1 ? "s" : ""}`;
  }

  if (category === "transport") {
    const total = multiplyBand(profile.localTransport, travelers);
    return `estimation IA+ : env. ${range(profile.localTransport)} €/pers./jour · env. ${range(total)} € total pour ${travelers} pers.`;
  }

  const unit = isLikelyPublicActivity(itemText) ? profile.publicActivity : profile.activity;
  const total = multiplyBand(unit, travelers);
  return `estimation IA+ : env. ${range(unit)} €/pers. · env. ${range(total)} € total pour ${travelers} pers.`;
}

function headingCategory(value: string): Exclude<TravelEstimateCategory, "general"> | null {
  const text = normalize(value);
  if (/hotel|hebergement|logement|nuit/.test(text)) return "hotel";
  if (/dejeuner|diner|restaurant|repas|petit dejeuner/.test(text)) return "restaurant";
  if (/arrivee|depart|transport|transfert|trajet/.test(text)) return "transport";
  if (/matin|apres midi|activite|visite|soir/.test(text)) return "activity";
  return null;
}

function lineCategory(value: string): Exclude<TravelEstimateCategory, "general"> | null {
  const text = normalize(value);
  if (/hotel|hebergement|logement|nuit/.test(text)) return "hotel";
  if (/dejeuner|diner|restaurant|repas|menu/.test(text)) return "restaurant";
  if (/aeroport|bus|metro|navette|taxi|train|tram|transport|transfert|trajet/.test(text))
    return "transport";
  if (/activite|billet|catacombe|excursion|musee|visite/.test(text)) return "activity";
  return null;
}

const PRICE_TO_CONFIRM = /(?:prix|tarif|co[uû]t)\s+(?:à|a)\s+confirmer\b/i;
const PRICE_TO_CONFIRM_REPLACE =
  /\s*(?:[·|—–-]\s*)?(?:prix|tarif|co[uû]t)\s+(?:à|a)\s+confirmer\b/gi;

export function enrichAiPlusPricePlaceholders(
  content: string,
  context: TravelPriceEstimateContext,
) {
  let currentCategory: Exclude<TravelEstimateCategory, "general"> | null = null;
  let suppressEstimates = false;

  return String(content ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const heading = line.match(/^\s*#{1,6}\s+(.+)$/);
      if (heading) {
        const normalized = normalize(heading[1]);
        suppressEstimates = /^(?:a verifier|sources?)(?:\b|$)/.test(normalized);
        currentCategory = /\b20\d{2}\s+\d{2}\s+\d{2}\b/.test(normalized)
          ? null
          : headingCategory(heading[1]);
        return line;
      }

      if (suppressEstimates || !PRICE_TO_CONFIRM.test(line)) return line;
      const explicitCategory = lineCategory(line);
      const category =
        currentCategory === "activity"
          ? (explicitCategory ?? currentCategory)
          : (currentCategory ?? explicitCategory);
      if (!category) return line;
      const estimate = formatTravelPriceEstimate(category, context, line);
      return line.replace(PRICE_TO_CONFIRM_REPLACE, ` · ${estimate}`);
    })
    .join("\n");
}

export function buildTravelPriceEstimateGuide(
  context: TravelPriceEstimateContext,
  requestedCategories: TravelEstimateCategory[],
) {
  const profile = costProfile(context);
  const categories = requestedCategories.includes("general")
    ? (["hotel", "activity", "restaurant", "transport"] as const)
    : requestedCategories;
  const unique = new Set(categories);
  const destination =
    [context.city, context.country].filter(Boolean).join(", ") || "destination non précisée";
  const travelers = travelerCount(context.travelers);
  const rooms = roomCount(context);
  const nights = nightCount(context);
  const lines = [
    `REPÈRES IA+ — ESTIMATIONS DE PLANIFICATION EN EUR, NON TARIFS RÉSERVABLES`,
    `Destination : ${destination} · ${profile.label} · ${travelers} voyageur${travelers > 1 ? "s" : ""}.`,
  ];

  if (unique.has("hotel")) {
    const nightlyTotal = multiplyBand(profile.hotel, rooms);
    const stayTotal = nights ? multiplyBand(nightlyTotal, nights) : null;
    lines.push(
      `- Hôtel : ${range(profile.hotel)} €/chambre/nuit ; hypothèse ${rooms} chambre${rooms > 1 ? "s" : ""}, soit ${range(nightlyTotal)} € total/nuit${stayTotal ? ` et ${range(stayTotal)} € pour ${nights} nuits` : ""}.`,
    );
  }
  if (unique.has("restaurant")) {
    lines.push(
      `- Repas : ${range(profile.meal)} €/pers., soit ${range(multiplyBand(profile.meal, travelers))} € total par repas.`,
    );
  }
  if (unique.has("activity")) {
    lines.push(
      `- Activité payante : ${range(profile.activity)} €/pers., soit ${range(multiplyBand(profile.activity, travelers))} € total ; promenade ou lieu public : ${range(profile.publicActivity)} €/pers.`,
    );
  }
  if (unique.has("transport")) {
    lines.push(
      `- Transports locaux : ${range(profile.localTransport)} €/pers./jour, soit ${range(multiplyBand(profile.localTransport, travelers))} € total/jour ; taxi ou transfert : ${range(profile.transfer)} €/véhicule.`,
    );
  }

  lines.push(
    "Ces fourchettes servent uniquement quand aucun tarif exact n'est disponible. Écris alors « estimation IA+ » ; ne les cite pas comme une source et utilise la borne haute dans le budget.",
  );
  return lines.join("\n");
}
