const PRICE_SEARCH_TIMEOUT_MS = 6_500;
const MAX_TRUSTED_SOURCES = 14;

export type TravelPriceCategory = "hotel" | "activity" | "restaurant" | "transport" | "general";
export type TravelSourceAuthority =
  | "booking_api"
  | "google_places"
  | "verified_catalog"
  | "official_candidate"
  | "booking"
  | "getyourguide"
  | "fallback";

export type VerifiedHotelEvidence = {
  name: string;
  livePrice: boolean;
  checkin: string | null;
  checkout: string | null;
  nights: number | null;
  travelers: number;
  rooms: number;
  occupancyAssumed: boolean;
  totalPrice: number | null;
  pricePerNight: number | null;
  currency: string | null;
  rating: number | null;
  reviewsCount: number | null;
  stars: number | null;
  checkedAt: string | null;
};

export type TravelPriceSource = {
  title: string;
  url: string;
  snippet: string;
  category: TravelPriceCategory;
  authority: TravelSourceAuthority;
  priceUsable: boolean;
  hotel?: VerifiedHotelEvidence;
};

export type TravelPriceSearchContext = {
  query: string;
  city?: string | null;
  country?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  travelers?: number;
  mode?: string | null;
};

type TavilySpec = {
  category: TravelPriceCategory;
  authority: TravelSourceAuthority;
  query: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  maxResults: number;
  searchDepth?: "basic" | "advanced";
};

type TavilyResult = { title?: string; url?: string; content?: string };

const LOW_TRUST_DOMAINS = [
  "tripadvisor.com",
  "tripadvisor.fr",
  "thefork.com",
  "thefork.fr",
  "yelp.com",
  "restaurantguru.com",
  "petitfute.com",
  "ubereats.com",
  "deliveroo.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "reddit.com",
  "pinterest.com",
  "wikipedia.org",
];

function cleanText(value: unknown, max: number) {
  return (
    String(value ?? "")
      .normalize("NFKC")
      // eslint-disable-next-line no-control-regex -- search snippets are external untrusted input
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

function normalizeQuery(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeHttpsUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizedHost(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`);
}

function isLowTrustHost(host: string) {
  return LOW_TRUST_DOMAINS.some((domain) => hostMatches(host, domain));
}

export function hasExplicitPriceEvidence(value: unknown) {
  const text = cleanText(value, 1_500);
  return /(?:€|\bEUR\b|\bCHF\b|\bUSD\b|\bGBP\b|\bCAD\b|\bAUD\b|\bJPY\b|\bMAD\b|\bTND\b|\bIDR\b)\s*[0-9]|[0-9](?:[0-9\s.,]*[0-9])?\s*(?:€|\bEUR\b|\bCHF\b|\bUSD\b|\bGBP\b|\bCAD\b|\bAUD\b|\bJPY\b|\bMAD\b|\bTND\b|\bIDR\b)/i.test(
    text,
  );
}

function isExactProviderPage(url: URL, authority: TravelSourceAuthority) {
  const path = url.pathname.toLowerCase();
  if (authority === "booking") return /^\/hotel\//.test(path);
  if (authority === "getyourguide") {
    return !/^\/(?:s|search)(?:\/|$)/.test(path) && path.split("/").filter(Boolean).length >= 2;
  }
  return false;
}

export function classifyTravelSource(
  rawUrl: string,
  category: TravelPriceCategory,
  requestedAuthority: TravelSourceAuthority,
): Pick<TravelPriceSource, "authority" | "priceUsable"> {
  const url = safeHttpsUrl(rawUrl);
  if (!url) return { authority: "fallback", priceUsable: false };
  const host = normalizedHost(url);

  if (hostMatches(host, "booking.com")) {
    return {
      authority: "booking",
      priceUsable: category === "hotel",
    };
  }
  if (hostMatches(host, "getyourguide.com")) {
    return {
      authority: "getyourguide",
      priceUsable: category === "activity",
    };
  }
  if (isLowTrustHost(host)) return { authority: "fallback", priceUsable: false };

  if (requestedAuthority === "official_candidate") {
    // A search engine result cannot prove that an arbitrary domain is the
    // establishment's official website. It remains useful for discovery, but
    // its price must not be presented as verified without a provider match.
    return { authority: "official_candidate", priceUsable: false };
  }
  return { authority: requestedAuthority, priceUsable: false };
}

export function priceSearchCategories(context: TravelPriceSearchContext): TravelPriceCategory[] {
  const text = normalizeQuery(`${context.mode || ""} ${context.query}`);
  const planner =
    context.mode === "plan" ||
    /\b(itineraire|programme|voyage complet|sejour complet)\b/.test(text);
  const categories: TravelPriceCategory[] = [];

  if (planner || /\b(hotels?|hebergements?|logements?|nuits?)\b/.test(text)) {
    categories.push("hotel");
  }
  if (planner || /\b(activites?|visites?|excursions?|billets?|attractions?|tours?)\b/.test(text)) {
    categories.push("activity");
  }
  if (planner || /\b(restaurants?|repas|dejeuners?|diners?|manger|food)\b/.test(text)) {
    categories.push("restaurant");
  }
  if (
    planner ||
    /\b(transports?|metros?|bus|trams?|trains?|taxis?|pass|trajets?|navettes?)\b/.test(text)
  ) {
    categories.push("transport");
  }
  return categories.length ? categories : ["general"];
}

function sourcePriority(source: TravelPriceSource) {
  if (source.authority === "booking_api") return 100;
  if (source.authority === "google_places") return 80;
  if (source.authority === "verified_catalog") return 70;
  if (source.priceUsable) return 50;
  if (source.authority === "booking" || source.authority === "getyourguide") return 40;
  if (source.authority === "official_candidate") return 30;
  return 10;
}

async function tavilySearch(apiKey: string, spec: TavilySpec): Promise<TravelPriceSource[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRICE_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: spec.query,
        search_depth: spec.searchDepth ?? "basic",
        max_results: spec.maxResults,
        include_answer: false,
        include_raw_content: false,
        include_domains: spec.includeDomains,
        exclude_domains: spec.excludeDomains,
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { results?: TavilyResult[] };
    return (payload.results ?? []).flatMap((result) => {
      const url = safeHttpsUrl(result.url);
      if (!url) return [];
      const trust = classifyTravelSource(url.toString(), spec.category, spec.authority);
      const snippet = cleanText(result.content, 700);
      const exactProviderPrice =
        trust.priceUsable &&
        isExactProviderPage(url, trust.authority) &&
        hasExplicitPriceEvidence(`${result.title ?? ""} ${snippet}`);
      return [
        {
          title: cleanText(result.title, 180) || url.hostname,
          url: url.toString(),
          snippet,
          category: spec.category,
          authority: trust.authority,
          priceUsable: exactProviderPrice,
        },
      ];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function dateLabel(context: TravelPriceSearchContext) {
  if (context.startsOn && context.endsOn) return `${context.startsOn} au ${context.endsOn}`;
  if (context.startsOn) return context.startsOn;
  return String(new Date().getUTCFullYear());
}

function destinationLabel(context: TravelPriceSearchContext) {
  return [context.city, context.country].filter(Boolean).join(", ") || "destination";
}

function buildSpecs(context: TravelPriceSearchContext): TavilySpec[] {
  const destination = destinationLabel(context);
  const dates = dateLabel(context);
  const travelers = Math.min(50, Math.max(1, Math.round(Number(context.travelers) || 1)));
  const base = cleanText(context.query, 700);
  const categories = priceSearchCategories(context);
  const specs: TavilySpec[] = [];

  if (categories.includes("hotel")) {
    specs.push({
      category: "hotel",
      authority: "booking",
      query: `${destination} ${dates} ${travelers} voyageurs hôtels prix disponibilité Booking.com ${base}`,
      includeDomains: ["booking.com"],
      maxResults: 4,
    });
    specs.push({
      category: "hotel",
      authority: "official_candidate",
      query: `${destination} ${dates} hôtel tarif réservation site officiel ${base}`,
      excludeDomains: LOW_TRUST_DOMAINS,
      maxResults: 3,
    });
  }

  if (categories.includes("activity")) {
    specs.push({
      category: "activity",
      authority: "getyourguide",
      query: `${destination} ${dates} activités billets prix disponibilité GetYourGuide ${base}`,
      includeDomains: ["getyourguide.com"],
      maxResults: 4,
    });
    specs.push({
      category: "activity",
      authority: "official_candidate",
      query: `${destination} ${dates} activité attraction billet tarif site officiel ${base}`,
      excludeDomains: LOW_TRUST_DOMAINS,
      maxResults: 3,
    });
  }

  if (categories.includes("restaurant")) {
    specs.push({
      category: "restaurant",
      authority: "official_candidate",
      query: `${destination} restaurant menu officiel carte prix tarifs ${dates} ${base}`,
      excludeDomains: LOW_TRUST_DOMAINS,
      maxResults: 4,
    });
  }

  if (categories.includes("transport")) {
    specs.push({
      category: "transport",
      authority: "official_candidate",
      query: `${destination} transport public opérateur officiel tarif ticket pass ${dates} ${base}`,
      excludeDomains: LOW_TRUST_DOMAINS,
      maxResults: 4,
    });
  }

  if (categories.includes("general")) {
    specs.push({
      category: "general",
      authority: "official_candidate",
      query: `${destination} ${dates} prix tarif site officiel ${base}`,
      excludeDomains: LOW_TRUST_DOMAINS,
      maxResults: 5,
      searchDepth: "advanced",
    });
  }

  return specs;
}

export function mergeTravelPriceSources(sources: TravelPriceSource[], limit = MAX_TRUSTED_SOURCES) {
  const seen = new Set<string>();
  return sources
    .sort((a, b) => sourcePriority(b) - sourcePriority(a))
    .filter((source) => {
      const url = safeHttpsUrl(source.url);
      if (!url) return false;
      const hotelName =
        source.category === "hotel"
          ? normalizeQuery(source.hotel?.name || source.title).trim()
          : "";
      const key = hotelName
        ? `hotel:${hotelName}`
        : `${normalizedHost(url)}${url.pathname.replace(/\/$/, "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, Math.min(30, Math.trunc(limit))));
}

export async function searchPriorityTravelPriceSources(
  context: TravelPriceSearchContext,
): Promise<TravelPriceSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const primary = mergeTravelPriceSources(
    (await Promise.all(buildSpecs(context).map((spec) => tavilySearch(apiKey, spec)))).flat(),
  );
  if (primary.filter((source) => source.priceUsable).length >= 4 || primary.length >= 8)
    return primary;

  const fallback = await tavilySearch(apiKey, {
    category: "general",
    authority: "fallback",
    query: `${destinationLabel(context)} ${dateLabel(context)} ${cleanText(context.query, 700)} voyage prix tarifs horaires disponibilité`,
    maxResults: 6,
    searchDepth: "advanced",
  });
  return mergeTravelPriceSources([...primary, ...fallback]);
}

export function travelSourcePromptLabel(source: TravelPriceSource) {
  const category =
    source.category === "hotel"
      ? "HÔTEL"
      : source.category === "activity"
        ? "ACTIVITÉ"
        : source.category === "restaurant"
          ? "RESTAURANT"
          : source.category === "transport"
            ? "TRANSPORT"
            : "GÉNÉRAL";
  const authority =
    source.authority === "booking_api"
      ? "BOOKING.COM DEMAND API — TARIF DATÉ VÉRIFIÉ"
      : source.authority === "google_places"
        ? "GOOGLE PLACES — ÉTABLISSEMENT VÉRIFIÉ, PRIX NON FOURNI"
        : source.authority === "verified_catalog"
          ? "CATALOGUE GLOBELINK VÉRIFIÉ — PRIX NON DATÉ"
          : source.authority === "booking"
            ? "BOOKING.COM"
            : source.authority === "getyourguide"
              ? "GETYOURGUIDE"
              : source.authority === "official_candidate"
                ? "SOURCE OFFICIELLE À CONFIRMER"
                : "WEB SECONDAIRE";
  const priceStatus =
    source.authority === "booking_api" && source.priceUsable
      ? "PRIX UTILISABLE POUR LES DATES ET L'OCCUPATION INDIQUÉES"
      : source.priceUsable
        ? "PRIX OBSERVÉ DANS L'EXTRAIT — À CONFIRMER"
        : "NE PAS UTILISER SEUL POUR UN PRIX";
  return `${category} · ${authority} · ${priceStatus}`;
}
