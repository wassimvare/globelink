import { createClient } from "npm:@supabase/supabase-js@2";

type CatalogKind = "activity" | "restaurant" | "hotel" | "deal";
type Area = {
  id: string;
  city: string;
  country: string;
  country_code: string | null;
  iata_code: string | null;
  latitude: number;
  longitude: number;
  radius_m: number;
};
type CatalogRow = {
  provider: string;
  external_id: string;
  kind: CatalogKind;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  city: string | null;
  country: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  source_url: string;
  booking_url: string | null;
  price_amount: number | null;
  currency: string | null;
  price_text: string | null;
  rating: number | null;
  reviews_count: number;
  opening_hours: string | null;
  tags: Record<string, unknown>;
  area_id: string | null;
  fetched_at: string;
  valid_until: string | null;
  published: boolean;
  admin_hidden: boolean;
};

function readDefaultKey(jsonName: string): string {
  try {
    const raw = Deno.env.get(jsonName);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? "";
  } catch {
    return "";
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? readDefaultKey("SUPABASE_SECRET_KEYS");
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  readDefaultKey("SUPABASE_PUBLISHABLE_KEYS");
const SYNC_SECRET = Deno.env.get("CATALOG_SYNC_SECRET") ?? "";
const AMADEUS_ID = Deno.env.get("AMADEUS_CLIENT_ID") ?? "";
const AMADEUS_SECRET = Deno.env.get("AMADEUS_CLIENT_SECRET") ?? "";
const AMADEUS_ENV = Deno.env.get("AMADEUS_ENV") === "production" ? "production" : "test";
const TAVILY_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const BOOKING_TOKEN =
  Deno.env.get("BOOKING_API_TOKEN") ?? Deno.env.get("BOOKING_PARTNER_API_KEY") ?? "";
const BOOKING_AFFILIATE_ID = Deno.env.get("BOOKING_AFFILIATE_ID") ?? "";
const BOOKING_API_BASE = (
  Deno.env.get("BOOKING_API_BASE_URL") ?? "https://demandapi.booking.com/3.1"
).replace(/\/+$/, "");
const BOOKING_SEARCH_ENDPOINT =
  Deno.env.get("BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT") ??
  `${BOOKING_API_BASE}/accommodations/search`;
const TRIPADVISOR_KEY = Deno.env.get("TRIPADVISOR_API_KEY") ?? "";
const TRIPADVISOR_API_BASE = (
  Deno.env.get("TRIPADVISOR_API_BASE_URL") ?? "https://api.content.tripadvisor.com/api/v1"
).replace(/\/+$/, "");
const GETYOURGUIDE_KEY =
  Deno.env.get("GETYOURGUIDE_API_KEY") ?? Deno.env.get("GETYOURGUIDE_PARTNER_API_KEY") ?? "";
const GETYOURGUIDE_API_BASE = (
  Deno.env.get("GETYOURGUIDE_API_BASE_URL") ?? "https://api.getyourguide.com/1"
).replace(/\/+$/, "");
const YELP_KEY = Deno.env.get("YELP_API_KEY") ?? "";
const YELP_API_BASE = (Deno.env.get("YELP_API_BASE_URL") ?? "https://api.yelp.com/v3").replace(
  /\/+$/,
  "",
);
const APP_IDENTITY = "GlobeLink/9.0 (+https://github.com/wassimvare/globelink)";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase server secrets are missing");
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function clean(value: unknown, max = 500): string {
  return (
    String(value ?? "")
      .normalize("NFKC")
      // eslint-disable-next-line no-control-regex -- non-printable upstream text is intentionally removed
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}
function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" ? url.toString().slice(0, 1500) : null;
  } catch {
    return null;
  }
}
function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "lieu"
  );
}
function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function tomorrowIso(days = 1) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString();
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "results", "items", "businesses", "tours", "accommodations"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

function firstString(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getPath(item, path);
    if (typeof value === "string" && value.trim()) return clean(value, 500);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = numberOrNull(getPath(item, path));
    if (value !== null) return value;
  }
  return null;
}

function firstHttps(item: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getPath(item, path);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const direct = safeHttps(entry);
        if (direct) return direct;
        const nested = safeHttps(getPath(entry, "url") ?? getPath(entry, "large.url"));
        if (nested) return nested;
      }
    }
    const url = safeHttps(value);
    if (url) return url;
  }
  return null;
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function providerTags(
  provider: string,
  label: string,
  sourceUrl: string,
  imageUrl: string | null,
  sourceApiProvider: string,
) {
  return {
    official_source_provider: provider,
    official_source_label: label,
    official_source_url: sourceUrl,
    official_source_verified: true,
    strict_official_source_verified: true,
    provider_verified: true,
    source_is_search_only: false,
    source_strategy: "official-catalog-apis-v1",
    source_verification_status: "source_officielle_api",
    source_api_provider: sourceApiProvider,
    official_image_url: imageUrl,
  };
}

function bookingSearchUrl(title: string, area: Area) {
  const url = new URL("https://www.booking.com/searchresults.fr.html");
  url.searchParams.set("ss", [title, area.city, area.country].filter(Boolean).join(", "));
  url.searchParams.set("group_adults", "2");
  url.searchParams.set("no_rooms", "1");
  url.searchParams.set("group_children", "0");
  return url.toString();
}

function tripadvisorSearchUrl(title: string, area: Area, prefix = "activité") {
  const url = new URL("https://www.tripadvisor.fr/Search");
  url.searchParams.set("q", [prefix, title, area.city, area.country].filter(Boolean).join(" "));
  return url.toString();
}

function getYourGuideSearchUrl(title: string, area: Area) {
  const url = new URL("https://www.getyourguide.fr/s/");
  url.searchParams.set("q", [title, area.city, area.country].filter(Boolean).join(", "));
  return url.toString();
}

type AuthorizationMode = "secret" | "admin";

async function authorizationMode(req: Request): Promise<AuthorizationMode | null> {
  const suppliedSecret = req.headers.get("x-catalog-sync-secret") ?? "";
  if (SYNC_SECRET && suppliedSecret && suppliedSecret === SYNC_SECRET) return "secret";

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data: userData } = await db.auth.getUser(token);
  const userId = userData.user?.id;
  if (!userId) return null;
  const { data: role } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return role ? "admin" : null;
}

function osmKind(tags: Record<string, string>): { kind: CatalogKind; category: string } | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  if (["restaurant", "cafe", "fast_food", "food_court"].includes(amenity))
    return { kind: "restaurant", category: "restaurant" };
  if (["hotel", "hostel", "guest_house", "motel", "resort", "apartment"].includes(tourism))
    return { kind: "hotel", category: "hotel" };
  if (tourism === "museum" || tourism === "gallery") return { kind: "activity", category: "musee" };
  if (["attraction", "theme_park", "zoo", "aquarium", "viewpoint", "information"].includes(tourism))
    return { kind: "activity", category: "activite" };
  if (
    [
      "park",
      "nature_reserve",
      "water_park",
      "sports_centre",
      "bowling_alley",
      "marina",
      "horse_riding",
    ].includes(leisure)
  )
    return { kind: "activity", category: "activite" };
  if (["cinema", "theatre", "arts_centre", "events_venue"].includes(amenity))
    return { kind: "activity", category: amenity === "events_venue" ? "event" : "activite" };
  return null;
}

function osmDescription(tags: Record<string, string>, kind: CatalogKind): string | null {
  const direct = clean(tags.description || tags["description:fr"] || tags.note, 700);
  if (direct) return direct;
  const parts: string[] = [];
  if (kind === "restaurant" && tags.cuisine)
    parts.push(`Cuisine : ${tags.cuisine.replace(/;/g, ", ")}`);
  if (tags.operator) parts.push(`Exploitant : ${tags.operator}`);
  if (tags.opening_hours) parts.push(`Horaires : ${tags.opening_hours}`);
  if (tags.wheelchair) parts.push(`Accessibilité PMR : ${tags.wheelchair}`);
  return parts.length ? parts.join(" · ").slice(0, 700) : null;
}

async function fetchOsmArea(area: Area): Promise<CatalogRow[]> {
  const query = `[out:json][timeout:25];
(
  nwr(around:${area.radius_m},${area.latitude},${area.longitude})["amenity"~"^(restaurant|cafe|fast_food|food_court|cinema|theatre|arts_centre|events_venue)$"]["name"];
  nwr(around:${area.radius_m},${area.latitude},${area.longitude})["tourism"~"^(hotel|hostel|guest_house|motel|resort|apartment|attraction|theme_park|zoo|aquarium|viewpoint|museum|gallery|information)$"]["name"];
  nwr(around:${area.radius_m},${area.latitude},${area.longitude})["leisure"~"^(park|nature_reserve|water_park|sports_centre|bowling_alley|marina|horse_riding)$"]["name"];
);
out center 240;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 29_000);
  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": APP_IDENTITY,
      },
      body: new URLSearchParams({ data: query }),
    });
    if (!response.ok) throw new Error(`Overpass ${response.status}`);
    const json = (await response.json()) as { elements?: Array<any> };
    const now = new Date().toISOString();
    return (json.elements ?? []).flatMap((element) => {
      const tags = (element.tags ?? {}) as Record<string, string>;
      const mapped = osmKind(tags);
      const title = clean(tags.name || tags["name:fr"] || tags["name:en"], 180);
      const latitude = numberOrNull(element.lat ?? element.center?.lat);
      const longitude = numberOrNull(element.lon ?? element.center?.lon);
      if (!mapped || !title || latitude === null || longitude === null) return [];
      const externalId = `${element.type}/${element.id}`;
      const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
      const website = safeHttps(tags.website || tags["contact:website"]);
      const image =
        safeHttps(tags.image) ||
        (tags.wikimedia_commons?.startsWith("https://") ? safeHttps(tags.wikimedia_commons) : null);
      return [
        {
          provider: "openstreetmap",
          external_id: externalId,
          kind: mapped.kind,
          slug: `${slugify(title)}-osm-${element.type}-${element.id}`.slice(0, 210),
          title,
          description: osmDescription(tags, mapped.kind),
          category: mapped.category,
          city: area.city,
          country: area.country,
          country_code: area.country_code,
          latitude,
          longitude,
          image_url: image,
          source_url: sourceUrl,
          booking_url: website,
          price_amount: null,
          currency: null,
          price_text: tags.fee === "no" ? "Gratuit" : null,
          rating: null,
          reviews_count: 0,
          opening_hours: clean(tags.opening_hours, 240) || null,
          tags: {
            amenity: tags.amenity ?? null,
            tourism: tags.tourism ?? null,
            leisure: tags.leisure ?? null,
            cuisine: tags.cuisine ?? null,
            phone: clean(tags.phone || tags["contact:phone"], 80) || null,
            website,
            image: safeHttps(tags.image),
            wikimedia_commons: clean(tags.wikimedia_commons, 240) || null,
            wikidata: clean(tags.wikidata, 40) || null,
            wikipedia: clean(tags.wikipedia, 200) || null,
            osm_license: "ODbL",
          },
          area_id: area.id,
          fetched_at: now,
          valid_until: tomorrowIso(30),
          published: true,
          admin_hidden: false,
        } satisfies CatalogRow,
      ];
    });
  } finally {
    clearTimeout(timer);
  }
}

async function amadeusToken(): Promise<{ token: string; base: string } | null> {
  if (!AMADEUS_ID || !AMADEUS_SECRET) return null;
  const base =
    AMADEUS_ENV === "production" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
  const response = await fetch(`${base}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: AMADEUS_ID,
      client_secret: AMADEUS_SECRET,
    }),
  });
  if (!response.ok) throw new Error(`Amadeus auth ${response.status}`);
  const json = (await response.json()) as { access_token?: string };
  return json.access_token ? { token: json.access_token, base } : null;
}

async function fetchAmadeusDeals(
  area: Area,
  auth: { token: string; base: string },
): Promise<CatalogRow[]> {
  const radiusKm = Math.max(1, Math.min(20, Math.round(area.radius_m / 1000)));
  const url = new URL(`${auth.base}/v1/shopping/activities`);
  url.searchParams.set("latitude", String(area.latitude));
  url.searchParams.set("longitude", String(area.longitude));
  url.searchParams.set("radius", String(radiusKm));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } });
  if (!response.ok) throw new Error(`Amadeus activities ${response.status}`);
  const json = (await response.json()) as { data?: Array<any> };
  const now = new Date().toISOString();
  return (json.data ?? []).slice(0, 30).flatMap((item) => {
    const title = clean(item.name, 180);
    const bookingUrl = safeHttps(item.bookingLink);
    const sourceUrl = bookingUrl || safeHttps(item.self?.href);
    const externalId = clean(item.id, 160);
    if (!title || !sourceUrl || !externalId) return [];
    const amount = numberOrNull(item.price?.amount);
    const currency = clean(item.price?.currencyCode, 8).toUpperCase() || null;
    const priceText =
      amount !== null && currency
        ? `dès ${new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(amount)}`
        : null;
    return [
      {
        provider: "amadeus",
        external_id: `activity-deal:${externalId}`,
        kind: "deal",
        slug: `${slugify(title)}-amadeus-${slugify(externalId)}`.slice(0, 210),
        title,
        description: clean(item.shortDescription, 900) || null,
        category: "Activité",
        city: area.city,
        country: area.country,
        country_code: area.country_code,
        latitude: numberOrNull(item.geoCode?.latitude),
        longitude: numberOrNull(item.geoCode?.longitude),
        image_url: safeHttps(Array.isArray(item.pictures) ? item.pictures[0] : null),
        source_url: sourceUrl,
        booking_url: bookingUrl,
        price_amount: amount,
        currency,
        price_text: priceText,
        rating: numberOrNull(item.rating),
        reviews_count: 0,
        opening_hours: null,
        tags: { source: "Amadeus Tours and Activities", environment: AMADEUS_ENV },
        area_id: area.id,
        fetched_at: now,
        valid_until: tomorrowIso(1.5),
        published: true,
        admin_hidden: false,
      } satisfies CatalogRow,
    ];
  });
}

async function fetchTavilyDeals(area: Area | null): Promise<CatalogRow[]> {
  if (!TAVILY_KEY) return [];
  const searchLocation = area ? `${area.city}, ${area.country}` : "France";
  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date());
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query: `offres voyage promotions vols hôtels activités ${searchLocation} ${date}`,
      topic: "general",
      search_depth: "advanced",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const json = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const now = new Date().toISOString();
  const rows: CatalogRow[] = [];
  for (const item of json.results ?? []) {
    const sourceUrl = safeHttps(item.url);
    const title = clean(item.title, 180);
    if (!sourceUrl || !title) continue;
    const hash = (await sha256(sourceUrl)).slice(0, 32);
    rows.push({
      provider: "tavily",
      external_id: `web-deal:${hash}`,
      kind: "deal",
      slug: `${slugify(title)}-web-${hash.slice(0, 10)}`,
      title,
      description: clean(item.content, 900) || null,
      category: "Bon plan à vérifier",
      city: area?.city ?? null,
      country: area?.country ?? null,
      country_code: area?.country_code ?? null,
      latitude: area?.latitude ?? null,
      longitude: area?.longitude ?? null,
      image_url: null,
      source_url: sourceUrl,
      booking_url: sourceUrl,
      price_amount: null,
      currency: null,
      price_text: "Prix à vérifier sur la source",
      rating: null,
      reviews_count: 0,
      opening_hours: null,
      tags: {
        source: "web-search",
        location_precision: area ? "search-area" : "unknown",
        warning: "availability-and-price-must-be-checked",
      },
      area_id: area?.id ?? null,
      fetched_at: now,
      valid_until: tomorrowIso(1.5),
      published: true,
      admin_hidden: false,
    });
  }
  return rows;
}

async function fetchBookingHotels(area: Area): Promise<CatalogRow[]> {
  if (!BOOKING_TOKEN) return [];
  const body = {
    booker: { country: "fr", platform: "desktop" },
    currency: "EUR",
    language: "fr",
    guests: { number_of_adults: 2, number_of_rooms: 1 },
    rows: 30,
    extras: ["extra_charges", "photos"],
    coordinates: {
      latitude: area.latitude,
      longitude: area.longitude,
      radius: Math.max(1, Math.round(area.radius_m / 1000)),
    },
  };
  const json = await fetchJson(BOOKING_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BOOKING_TOKEN}`,
      "X-Booking-API-Key": BOOKING_TOKEN,
      ...(BOOKING_AFFILIATE_ID ? { "X-Affiliate-Id": BOOKING_AFFILIATE_ID } : {}),
    },
    body: JSON.stringify(body),
  });
  const now = new Date().toISOString();
  return asArray(json).flatMap((item) => {
    const externalId = firstString(item, ["id", "hotel_id", "accommodation_id"]);
    const title = firstString(item, ["name", "hotel_name", "accommodation.name"]);
    if (!externalId || !title) return [];
    const sourceUrl =
      firstHttps(item, ["url", "booking_url", "deep_link", "page_url"]) ||
      bookingSearchUrl(title, area);
    const imageUrl = firstHttps(item, [
      "main_photo_url",
      "photo_url",
      "image_url",
      "photos",
      "photos.0.url",
    ]);
    if (!imageUrl) return [];
    return [
      {
        provider: "booking-com",
        external_id: externalId,
        kind: "hotel",
        slug: `${slugify(title)}-booking-${slugify(externalId).slice(-24)}`.slice(0, 210),
        title,
        description: firstString(item, ["description", "summary"]) || null,
        category: "hotel",
        city: area.city,
        country: area.country,
        country_code: area.country_code,
        latitude: firstNumber(item, ["latitude", "location.latitude", "coordinates.latitude"]),
        longitude: firstNumber(item, ["longitude", "location.longitude", "coordinates.longitude"]),
        image_url: imageUrl,
        source_url: sourceUrl,
        booking_url: sourceUrl,
        price_amount: firstNumber(item, ["price.amount", "price.total", "min_total_price"]),
        currency: firstString(item, ["price.currency", "currency"]).toUpperCase() || null,
        price_text: null,
        rating: firstNumber(item, ["review_score", "rating", "score"]),
        reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["review_count"]) ?? 0)),
        opening_hours: null,
        tags: providerTags("booking-com", "Booking.com", sourceUrl, imageUrl, "booking-demand-api"),
        area_id: area.id,
        fetched_at: now,
        valid_until: tomorrowIso(7),
        published: true,
        admin_hidden: false,
      } satisfies CatalogRow,
    ];
  });
}

async function fetchTripadvisorPhoto(locationId: string) {
  if (!TRIPADVISOR_KEY) return null;
  const url = new URL(`${TRIPADVISOR_API_BASE}/location/${encodeURIComponent(locationId)}/photos`);
  url.searchParams.set("key", TRIPADVISOR_KEY);
  url.searchParams.set("language", "fr");
  const json = await fetchJson(url.toString(), {}, 4_500);
  return firstHttps(json, ["data.0.images.large.url", "data.0.images.original.url", "data.0.url"]);
}

async function fetchTripadvisorActivities(area: Area): Promise<CatalogRow[]> {
  if (!TRIPADVISOR_KEY) return [];
  const url = new URL(`${TRIPADVISOR_API_BASE}/location/search`);
  url.searchParams.set("key", TRIPADVISOR_KEY);
  url.searchParams.set("language", "fr");
  url.searchParams.set("category", "attractions");
  url.searchParams.set("searchQuery", `${area.city}, ${area.country}`);
  url.searchParams.set("latLong", `${area.latitude},${area.longitude}`);
  const json = await fetchJson(url.toString());
  const now = new Date().toISOString();
  const rows: CatalogRow[] = [];
  for (const item of asArray(json).slice(0, 16)) {
    const externalId = firstString(item, ["location_id", "id"]);
    const title = firstString(item, ["name", "title"]);
    if (!externalId || !title) continue;
    const sourceUrl =
      firstHttps(item, ["web_url", "url"]) || tripadvisorSearchUrl(title, area, "activité");
    const imageUrl = await fetchTripadvisorPhoto(externalId).catch(() => null);
    if (!imageUrl) continue;
    rows.push({
      provider: "tripadvisor-attractions",
      external_id: externalId,
      kind: "activity",
      slug: `${slugify(title)}-tripadvisor-${slugify(externalId).slice(-24)}`.slice(0, 210),
      title,
      description: firstString(item, ["description", "ranking_data.ranking_string"]) || null,
      category: "activite",
      city: firstString(item, ["address_obj.city"]) || area.city,
      country: firstString(item, ["address_obj.country"]) || area.country,
      country_code: area.country_code,
      latitude: firstNumber(item, ["latitude"]) ?? area.latitude,
      longitude: firstNumber(item, ["longitude"]) ?? area.longitude,
      image_url: imageUrl,
      source_url: sourceUrl,
      booking_url: sourceUrl,
      price_amount: null,
      currency: null,
      price_text: null,
      rating: firstNumber(item, ["rating"]),
      reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["num_reviews"]) ?? 0)),
      opening_hours: null,
      tags: providerTags(
        "tripadvisor-attractions",
        "Tripadvisor",
        sourceUrl,
        imageUrl,
        "tripadvisor-content-api",
      ),
      area_id: area.id,
      fetched_at: now,
      valid_until: tomorrowIso(7),
      published: true,
      admin_hidden: false,
    });
  }
  return rows;
}

async function fetchGetYourGuideActivities(area: Area): Promise<CatalogRow[]> {
  if (!GETYOURGUIDE_KEY) return [];
  const url = new URL(`${GETYOURGUIDE_API_BASE}/tours`);
  url.searchParams.set("q", `${area.city}, ${area.country}`);
  url.searchParams.set("cnt_language", "fr");
  url.searchParams.set("currency", "EUR");
  url.searchParams.set("limit", "30");
  url.searchParams.set("coordinates", `${area.latitude},${area.longitude}`);
  url.searchParams.set("radius", String(Math.max(1, Math.round(area.radius_m / 1000))));
  const json = await fetchJson(url.toString(), {
    headers: { "X-ACCESS-TOKEN": GETYOURGUIDE_KEY, Authorization: `Bearer ${GETYOURGUIDE_KEY}` },
  });
  const now = new Date().toISOString();
  return asArray(json).flatMap((item) => {
    const externalId = firstString(item, ["tour_id", "id", "activity_id"]);
    const title = firstString(item, ["title", "name"]);
    if (!externalId || !title) return [];
    const sourceUrl =
      firstHttps(item, ["url", "deeplink", "booking_url", "abstract_link"]) ||
      getYourGuideSearchUrl(title, area);
    const imageUrl = firstHttps(item, [
      "pictures",
      "images",
      "image.url",
      "pictures.0.url",
      "images.0.url",
    ]);
    if (!imageUrl) return [];
    return [
      {
        provider: "getyourguide",
        external_id: externalId,
        kind: "activity",
        slug: `${slugify(title)}-getyourguide-${slugify(externalId).slice(-24)}`.slice(0, 210),
        title,
        description: firstString(item, ["abstract", "description", "teaser_text"]) || null,
        category: "activite",
        city: area.city,
        country: area.country,
        country_code: area.country_code,
        latitude: firstNumber(item, ["coordinates.lat", "latitude", "location.latitude"]),
        longitude: firstNumber(item, ["coordinates.long", "longitude", "location.longitude"]),
        image_url: imageUrl,
        source_url: sourceUrl,
        booking_url: sourceUrl,
        price_amount: firstNumber(item, ["price.values.amount", "price.amount"]),
        currency: firstString(item, ["price.currency", "currency"]).toUpperCase() || null,
        price_text: firstString(item, ["price.formatted", "price.text"]) || null,
        rating: firstNumber(item, ["rating", "reviews.average_rating"]),
        reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["reviews.count"]) ?? 0)),
        opening_hours: null,
        tags: providerTags(
          "getyourguide",
          "GetYourGuide",
          sourceUrl,
          imageUrl,
          "getyourguide-partner-api",
        ),
        area_id: area.id,
        fetched_at: now,
        valid_until: tomorrowIso(7),
        published: true,
        admin_hidden: false,
      } satisfies CatalogRow,
    ];
  });
}

async function fetchYelpRestaurants(area: Area): Promise<CatalogRow[]> {
  if (!YELP_KEY) return [];
  const url = new URL(`${YELP_API_BASE}/businesses/search`);
  url.searchParams.set("categories", "restaurants");
  url.searchParams.set("locale", "fr_FR");
  url.searchParams.set("limit", "40");
  url.searchParams.set("radius", String(Math.min(40_000, area.radius_m)));
  url.searchParams.set("latitude", String(area.latitude));
  url.searchParams.set("longitude", String(area.longitude));
  const json = await fetchJson(url.toString(), {
    headers: { Authorization: `Bearer ${YELP_KEY}` },
  });
  const now = new Date().toISOString();
  return asArray(json).flatMap((item) => {
    const externalId = firstString(item, ["id", "alias"]);
    const title = firstString(item, ["name"]);
    const sourceUrl = firstHttps(item, ["url"]);
    if (!externalId || !title || !sourceUrl) return [];
    const imageUrl = firstHttps(item, ["image_url"]);
    if (!imageUrl) return [];
    return [
      {
        provider: "yelp-restaurants",
        external_id: externalId,
        kind: "restaurant",
        slug: `${slugify(title)}-yelp-${slugify(externalId).slice(-24)}`.slice(0, 210),
        title,
        description: null,
        category: "restaurant",
        city: firstString(item, ["location.city"]) || area.city,
        country: firstString(item, ["location.country"]) || area.country,
        country_code: area.country_code,
        latitude: firstNumber(item, ["coordinates.latitude"]) ?? area.latitude,
        longitude: firstNumber(item, ["coordinates.longitude"]) ?? area.longitude,
        image_url: imageUrl,
        source_url: sourceUrl,
        booking_url: sourceUrl,
        price_amount: null,
        currency: null,
        price_text: firstString(item, ["price"]) || null,
        rating: firstNumber(item, ["rating"]),
        reviews_count: Math.max(0, Math.trunc(firstNumber(item, ["review_count"]) ?? 0)),
        opening_hours: null,
        tags: {
          ...providerTags("yelp-restaurants", "Yelp", sourceUrl, imageUrl, "yelp-fusion-api"),
          cuisine: firstString(item, ["categories.0.title"]) || null,
        },
        area_id: area.id,
        fetched_at: now,
        valid_until: tomorrowIso(7),
        published: true,
        admin_hidden: false,
      } satisfies CatalogRow,
    ];
  });
}

async function upsertRows(rows: CatalogRow[], blocked: Set<string>) {
  const allowed = rows.filter((row) => !blocked.has(`${row.provider}:${row.external_id}`));
  if (!allowed.length) return { imported: 0, skipped: rows.length };
  const deduped = Array.from(
    new Map(allowed.map((row) => [`${row.provider}:${row.external_id}`, row])).values(),
  );
  let imported = 0;
  for (let i = 0; i < deduped.length; i += 100) {
    const batch = deduped.slice(i, i + 100);
    const { error } = await db
      .from("external_catalog_items")
      .upsert(batch, { onConflict: "provider,external_id" });
    if (error) throw new Error(error.message);
    imported += batch.length;
  }
  return { imported, skipped: rows.length - allowed.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "POST required" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  const authMode = await authorizationMode(req);
  if (!authMode)
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.action === "configure-cron") {
    if (!SYNC_SECRET || !PUBLISHABLE_KEY) {
      return new Response(
        JSON.stringify({ error: "CATALOG_SYNC_SECRET or publishable key is missing" }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
    const schedule = "15 4 * * *";
    const { data: jobId, error } = await db.rpc("configure_catalog_daily_cron", {
      p_project_url: SUPABASE_URL,
      p_publishable_key: PUBLISHABLE_KEY,
      p_sync_secret: SYNC_SECRET,
      p_schedule: schedule,
    });
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: JSON_HEADERS,
      });
    return new Response(JSON.stringify({ ok: true, jobId, schedule }), { headers: JSON_HEADERS });
  }

  // Only a logged-in administrator can bypass the freshness window. The cron
  // secret can run the scheduled job but cannot be abused to force repeated API calls.
  const force = body.force === true && authMode === "admin";
  const triggerSource =
    authMode === "admin" ? "admin" : clean(body.triggerSource || "cron", 40) || "cron";

  const recentSince = new Date(Date.now() - 20 * 60 * 60_000).toISOString();
  if (!force) {
    const { data: recent } = await db
      .from("catalog_sync_runs")
      .select("id,finished_at,status")
      .eq("status", "success")
      .gte("finished_at", recentSince)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent)
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "already-fresh",
          lastRun: recent.finished_at,
        }),
        { headers: JSON_HEADERS },
      );
  }

  const staleRunningSince = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: running } = await db
    .from("catalog_sync_runs")
    .select("id,started_at")
    .eq("status", "running")
    .gte("started_at", staleRunningSince)
    .limit(1)
    .maybeSingle();
  if (running)
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already-running" }), {
      headers: JSON_HEADERS,
    });

  const { data: run, error: runError } = await db
    .from("catalog_sync_runs")
    .insert({ status: "running", trigger_source: triggerSource })
    .select("id")
    .single();
  if (runError || !run)
    return new Response(JSON.stringify({ error: runError?.message || "Cannot create run" }), {
      status: 500,
      headers: JSON_HEADERS,
    });

  const errors: Array<{ provider: string; area?: string; message: string }> = [];
  let imported = 0;
  let skipped = 0;
  let areasCount = 0;
  const providers = {
    openstreetmap: false,
    booking: false,
    tripadvisor: false,
    getyourguide: false,
    yelp: false,
    amadeus: false,
    tavily: false,
  };

  try {
    const { data: blockRows } = await db
      .from("external_catalog_blocks")
      .select("provider,external_id");
    const blocked = new Set(
      (blockRows ?? []).map((row: any) => `${row.provider}:${row.external_id}`),
    );

    const { data: areas, error: areasError } = await db
      .from("catalog_search_areas")
      .select("id,city,country,country_code,iata_code,latitude,longitude,radius_m")
      .eq("enabled", true)
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .order("priority", { ascending: true })
      .limit(20);
    if (areasError) throw new Error(areasError.message);

    const allAreas = ((areas ?? []) as Area[]).map((rawArea) => ({
      ...rawArea,
      latitude: Number(rawArea.latitude),
      longitude: Number(rawArea.longitude),
      radius_m: Number(rawArea.radius_m),
    }));
    const osmAreas = allAreas.slice(0, 4);
    areasCount = allAreas.length;

    // OpenStreetMap is refreshed in a rotating batch to remain respectful of the
    // public Overpass service. With the default eight zones, every zone is
    // refreshed at least every two days.
    for (const area of osmAreas) {
      try {
        const osmRows = await fetchOsmArea(area);
        const result = await upsertRows(osmRows, blocked);
        imported += result.imported;
        skipped += result.skipped;
        providers.openstreetmap = true;
      } catch (error) {
        errors.push({
          provider: "openstreetmap",
          area: `${area.city}, ${area.country}`,
          message: clean(error, 240),
        });
      }
      await db
        .from("catalog_search_areas")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", area.id);
      await delay(900);
    }

    for (const area of allAreas) {
      const officialImports: Array<{
        provider: keyof typeof providers;
        fetcher: (area: Area) => Promise<CatalogRow[]>;
      }> = [
        { provider: "booking", fetcher: fetchBookingHotels },
        { provider: "tripadvisor", fetcher: fetchTripadvisorActivities },
        { provider: "getyourguide", fetcher: fetchGetYourGuideActivities },
        { provider: "yelp", fetcher: fetchYelpRestaurants },
      ];
      for (const officialImport of officialImports) {
        try {
          const rows = await officialImport.fetcher(area);
          const result = await upsertRows(rows, blocked);
          imported += result.imported;
          skipped += result.skipped;
          providers[officialImport.provider] ||= rows.length > 0;
        } catch (error) {
          errors.push({
            provider: officialImport.provider,
            area: `${area.city}, ${area.country}`,
            message: clean(error, 240),
          });
        }
        await delay(220);
      }
    }

    // Offers are short-lived, so every enabled zone is checked on every daily
    // run whenever Amadeus credentials are configured.
    let amadeusAuth: { token: string; base: string } | null = null;
    try {
      amadeusAuth = await amadeusToken();
    } catch (error) {
      errors.push({ provider: "amadeus", message: clean(error, 240) });
    }
    if (amadeusAuth) {
      for (const area of allAreas) {
        try {
          const deals = await fetchAmadeusDeals(area, amadeusAuth);
          const result = await upsertRows(deals, blocked);
          imported += result.imported;
          skipped += result.skipped;
          providers.amadeus = true;
        } catch (error) {
          errors.push({
            provider: "amadeus",
            area: `${area.city}, ${area.country}`,
            message: clean(error, 240),
          });
        }
        await delay(250);
      }
    }

    try {
      const webDealsArea =
        allAreas.find((area) => area.country_code === "FR" && area.city === "Lyon") ??
        allAreas.find((area) => area.country_code === "FR") ??
        allAreas[0] ??
        null;
      const webDeals = await fetchTavilyDeals(webDealsArea);
      const result = await upsertRows(webDeals, blocked);
      imported += result.imported;
      skipped += result.skipped;
      providers.tavily = webDeals.length > 0;
    } catch (error) {
      errors.push({ provider: "tavily", message: clean(error, 240) });
    }

    await db.rpc("cleanup_stale_external_catalog");
    const status = errors.length === 0 ? "success" : imported > 0 ? "partial" : "failed";
    await db
      .from("catalog_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        areas_count: areasCount,
        imported_count: imported,
        updated_count: imported,
        skipped_count: skipped,
        errors,
        metadata: {
          providers,
          amadeusEnvironment: AMADEUS_ENV,
          enabledAreas: allAreas.length,
          osmAreas: osmAreas.length,
        },
      })
      .eq("id", run.id);

    return new Response(
      JSON.stringify({
        ok: status !== "failed",
        runId: run.id,
        status,
        imported,
        skipped,
        areas: areasCount,
        providers,
        errors,
      }),
      {
        status: status === "failed" ? 502 : 200,
        headers: JSON_HEADERS,
      },
    );
  } catch (error) {
    const message = clean(error, 400) || "Unknown synchronization error";
    errors.push({ provider: "system", message });
    await db
      .from("catalog_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "failed",
        errors,
        areas_count: areasCount,
        imported_count: imported,
        skipped_count: skipped,
      })
      .eq("id", run.id);
    return new Response(JSON.stringify({ ok: false, runId: run.id, error: message, errors }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
