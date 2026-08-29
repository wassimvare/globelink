import { createServerFn } from "@tanstack/react-start";

export type PlaceLogoInput = {
  title: string;
  kind: "activity" | "restaurant" | "hotel" | "deal";
  latitude: number | null;
  longitude: number | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
};

export type PlaceLogoResult = {
  url: string | null;
  website: string | null;
  source: "official-website-logo" | null;
  label: string | null;
};

type AnyRecord = Record<string, unknown>;
type CacheEntry = { expires: number; value: PlaceLogoResult };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 12 * 60 * 60_000;
const USER_AGENT = "GlobeLink/11.1 (+https://github.com/wassimvare/globelink)";

const GENERIC_WORDS = new Set([
  "hotel",
  "hôtel",
  "restaurant",
  "cafe",
  "café",
  "bar",
  "the",
  "le",
  "la",
  "les",
  "de",
  "des",
  "du",
  "and",
]);

const THIRD_PARTY_HOSTS = [
  "google.com",
  "google.fr",
  "goo.gl",
  "maps.google.com",
  "openstreetmap.org",
  "booking.com",
  "tripadvisor.com",
  "tripadvisor.fr",
  "thefork.com",
  "thefork.fr",
  "opentable.com",
  "yelp.com",
  "getyourguide.com",
  "ticketmaster.com",
  "expedia.com",
  "expedia.fr",
  "hotels.com",
  "agoda.com",
  "airbnb.com",
  "kayak.com",
  "trivago.com",
];

function clean(value: unknown, max = 400) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: unknown) {
  return clean(value, 800)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !GENERIC_WORDS.has(token));
}

function similarity(left: unknown, right: unknown) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.93;
  const aa = tokens(left);
  const bb = new Set(tokens(right));
  if (!aa.length || !bb.size) return 0;
  const hit = aa.filter((token) => bb.has(token)).length;
  return hit / Math.max(aa.length, bb.size);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hostMatches(hostname: string, domain: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  const expected = domain.replace(/^www\./i, "").toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function safeOfficialWebsite(value: unknown): string | null {
  const raw = clean(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || THIRD_PARTY_HOSTS.some((domain) => hostMatches(hostname, domain))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function faviconUrl(website: string) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(website)}&sz=256`;
}

function resultForWebsite(website: string): PlaceLogoResult {
  const hostname = new URL(website).hostname.replace(/^www\./i, "");
  return {
    url: faviconUrl(website),
    website,
    source: "official-website-logo",
    label: `Logo du site officiel · ${hostname}`,
  };
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 5_500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    const value = (await response.json()) as unknown;
    return value && typeof value === "object" ? (value as AnyRecord) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function googleApiKey() {
  return clean(
    process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GLOBELINK_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY,
    512,
  );
}

type GooglePlace = {
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  websiteUri?: string;
  formattedAddress?: string;
};

async function websiteFromGoogle(input: PlaceLogoInput) {
  const key = googleApiKey();
  if (!key) return null;
  const textQuery = [input.title, input.city, input.country].filter(Boolean).join(", ");
  if (!textQuery) return null;

  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.location,places.websiteUri,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "fr",
        maxResultCount: 10,
        ...(input.latitude != null && input.longitude != null
          ? {
              locationBias: {
                circle: {
                  center: { latitude: input.latitude, longitude: input.longitude },
                  radius: input.kind === "activity" ? 5_000 : 2_500,
                },
              },
            }
          : {}),
      }),
    },
  );

  const rows = Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
  let best: { website: string; score: number } | null = null;
  for (const row of rows) {
    const website = safeOfficialWebsite(row.websiteUri);
    if (!website) continue;
    const name = clean(row.displayName?.text, 220);
    const nameScore = similarity(input.title, name);
    const minimum = input.kind === "restaurant" || input.kind === "hotel" ? 0.6 : 0.5;
    if (nameScore < minimum) continue;

    const lat = Number(row.location?.latitude);
    const lng = Number(row.location?.longitude);
    let distance = 0;
    if (
      input.latitude != null &&
      input.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      distance = haversineKm(input.latitude, input.longitude, lat, lng);
      const maxDistance = input.kind === "restaurant" || input.kind === "hotel" ? 2 : 6;
      if (distance > maxDistance) continue;
    }

    const locationText = normalize(row.formattedAddress);
    const city = normalize(input.city);
    const cityBonus = city && locationText.includes(city) ? 8 : 0;
    const score = nameScore * 100 - distance * 12 + cityBonus;
    if (!best || score > best.score) best = { website, score };
  }
  return best?.website ?? null;
}

async function websiteFromNominatim(input: PlaceLogoInput) {
  const query = [input.title, input.city, input.country].filter(Boolean).join(", ");
  if (!query) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query.slice(0, 280));
  url.searchParams.set("limit", "8");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  if (input.latitude != null && input.longitude != null) {
    url.searchParams.set(
      "viewbox",
      `${(input.longitude - 0.04).toFixed(6)},${(input.latitude + 0.03).toFixed(6)},${(input.longitude + 0.04).toFixed(6)},${(input.latitude - 0.03).toFixed(6)}`,
    );
  }

  const json = await fetchJson(url.toString(), { headers: { "Accept-Language": "fr,en;q=0.8" } });
  const rows = Array.isArray(json) ? (json as AnyRecord[]) : [];
  let best: { website: string; score: number } | null = null;
  for (const row of rows) {
    const named = row.namedetails && typeof row.namedetails === "object" ? (row.namedetails as AnyRecord) : {};
    const display = clean(row.display_name, 500);
    const name = clean(row.name, 220) || clean(named.name, 220) || display.split(",")[0]?.trim() || "";
    const nameScore = Math.max(similarity(input.title, name), similarity(input.title, display));
    if (nameScore < 0.58) continue;

    const lat = Number(row.lat);
    const lng = Number(row.lon);
    let distance = 0;
    if (
      input.latitude != null &&
      input.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      distance = haversineKm(input.latitude, input.longitude, lat, lng);
      if (distance > 4) continue;
    }

    const extra = row.extratags && typeof row.extratags === "object" ? (row.extratags as AnyRecord) : {};
    const website = safeOfficialWebsite(
      extra.website || extra["contact:website"] || extra.url || extra["contact:url"],
    );
    if (!website) continue;
    const score = nameScore * 100 - distance * 10;
    if (!best || score > best.score) best = { website, score };
  }
  return best?.website ?? null;
}

function validateInput(raw: PlaceLogoInput): PlaceLogoInput {
  const title = clean(raw?.title, 220);
  const kind = ["activity", "restaurant", "hotel", "deal"].includes(String(raw?.kind))
    ? raw.kind
    : "activity";
  const latitude = raw?.latitude == null ? null : Number(raw.latitude);
  const longitude = raw?.longitude == null ? null : Number(raw.longitude);
  return {
    title,
    kind,
    latitude: Number.isFinite(latitude) && latitude! >= -90 && latitude! <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude! >= -180 && longitude! <= 180 ? longitude : null,
    city: clean(raw?.city, 120) || null,
    country: clean(raw?.country, 120) || null,
    website: safeOfficialWebsite(raw?.website),
  };
}

export function placeLogoQueryKey(input: PlaceLogoInput) {
  return [
    "place-logo-v1",
    input.title,
    input.kind,
    input.latitude ?? null,
    input.longitude ?? null,
    input.city ?? null,
    input.country ?? null,
    input.website ?? null,
  ] as const;
}

export const resolvePlaceLogo = createServerFn({ method: "POST" })
  .validator((data: PlaceLogoInput) => validateInput(data))
  .handler(async ({ data }) => {
    if (!data.title) {
      return { url: null, website: null, source: null, label: null } satisfies PlaceLogoResult;
    }

    const cacheKey = placeLogoQueryKey(data).join("|");
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value;

    const website =
      data.website ?? (await websiteFromGoogle(data)) ?? (await websiteFromNominatim(data));
    const value = website
      ? resultForWebsite(website)
      : ({ url: null, website: null, source: null, label: null } satisfies PlaceLogoResult);

    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL, value });
    return value;
  });
