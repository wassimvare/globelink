const PRICE_SEARCH_TIMEOUT_MS = 6_500;
const MAX_TRUSTED_SOURCES = 14;

export type TravelPriceCategory = "hotel" | "activity" | "restaurant" | "transport" | "general";
export type TravelSourceAuthority =
  | "official_candidate"
  | "booking"
  | "getyourguide"
  | "fallback";

export type TravelPriceSource = {
  title: string;
  url: string;
  snippet: string;
  category: TravelPriceCategory;
  authority: TravelSourceAuthority;
  priceUsable: boolean;
};

type SearchContext = {
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
  return String(value ?? "")
    .normalize("NFKC")
    // eslint-disable-next-line no-control-regex -- search snippets are external untrusted input
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
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
    return { authority: "official_candidate", priceUsable: true };
  }
  return { authority: requestedAuthority, priceUsable: false };
}

export function priceSearchCategories(context: SearchContext): TravelPriceCategory[] {
  const text = `${context.mode || ""} ${context.query}`.normalize("NFKD").toLowerCase();
  const planner = /\b(plan|compare|itineraire|itinéraire|programme|voyage|sejour|séjour)\b/.test(text);
  const categories: TravelPriceCategory[] = [];

  if (planner || /\b(hotel|hôtel|hebergement|hébergement|logement|nuit)\b/.test(text)) {
    categories.push("hotel");
  }
  if (planner || /\b(activite|activité|visite|excursion|billet|attraction|tour)\b/.test(text)) {
    categories.push("activity");
  }
  if (planner || /\b(restaurant|repas|dejeuner|déjeuner|diner|dîner|manger|food)\b/.test(text)) {
    categories.push("restaurant");
  }
  if (planner || /\b(transport|metro|métro|bus|tram|train|taxi|pass|trajet|navette)\b/.test(text)) {
    categories.push("transport");
  }
  return categories.length ? categories : ["general"];
}

function sourcePriority(source: TravelPriceSource) {
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
      return [
        {
          title: cleanText(result.title, 180) || url.hostname,
          url: url.toString(),
          snippet: cleanText(result.content, 700),
          category: spec.category,
          authority: trust.authority,
          priceUsable: trust.priceUsable,
        },
      ];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function dateLabel(context: SearchContext) {
  if (context.startsOn && context.endsOn) return `${context.startsOn} au ${context.endsOn}`;
  if (context.startsOn) return context.startsOn;
  return String(new Date().getUTCFullYear());
}

function destinationLabel(context: SearchContext) {
  return [context.city, context.country].filter(Boolean).join(", ") || "destination";
}

function buildSpecs(context: SearchContext): TavilySpec[] {
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

function dedupeAndRank(sources: TravelPriceSource[]) {
  const seen = new Set<string>();
  return sources
    .sort((a, b) => sourcePriority(b) - sourcePriority(a))
    .filter((source) => {
      const url = safeHttpsUrl(source.url);
      if (!url) return false;
      const key = `${normalizedHost(url)}${url.pathname.replace(/\/$/, "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TRUSTED_SOURCES);
}

export async function searchPriorityTravelPriceSources(
  context: SearchContext,
): Promise<TravelPriceSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const primary = dedupeAndRank((await Promise.all(buildSpecs(context).map((spec) => tavilySearch(apiKey, spec)))).flat());
  if (primary.filter((source) => source.priceUsable).length >= 4 || primary.length >= 8) return primary;

  const fallback = await tavilySearch(apiKey, {
    category: "general",
    authority: "fallback",
    query: `${destinationLabel(context)} ${dateLabel(context)} ${cleanText(context.query, 700)} voyage prix tarifs horaires disponibilité`,
    maxResults: 6,
    searchDepth: "advanced",
  });
  return dedupeAndRank([...primary, ...fallback]);
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
    source.authority === "booking"
      ? "BOOKING.COM"
      : source.authority === "getyourguide"
        ? "GETYOURGUIDE"
        : source.authority === "official_candidate"
          ? "SOURCE OFFICIELLE À CONFIRMER"
          : "WEB SECONDAIRE";
  return `${category} · ${authority} · ${source.priceUsable ? "PRIX UTILISABLE SI LE CONTENU LE CONFIRME" : "NE PAS UTILISER SEUL POUR UN PRIX"}`;
}
