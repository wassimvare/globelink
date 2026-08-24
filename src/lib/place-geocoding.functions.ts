import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COUNTRIES } from "@/lib/countries";

const COUNTRY_SET = new Set<string>(COUNTRIES);
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_SPACING_MS = 1_100;
const DEFAULT_GEOCODING_URL = "https://nominatim.openstreetmap.org/search";
const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

type GeocodeInput = {
  city: string;
  country: string;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
  provider: "nominatim" | "open-meteo";
  cached: boolean;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  class?: string;
  type?: string;
  importance?: number;
  address?: {
    country?: string;
    country_code?: string;
  };
};

type OpenMeteoResult = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
    country?: string;
    country_code?: string;
    admin1?: string;
    admin2?: string;
    admin3?: string;
  }>;
};

const geocodeCache = new Map<string, { result: GeocodeResult; expiresAt: number }>();
let lastExternalRequestAt = 0;
let geocodeQueue: Promise<void> = Promise.resolve();

const COUNTRY_CODES: Record<string, string> = {
  "Afrique du Sud": "ZA",
  Albanie: "AL",
  Algérie: "DZ",
  Allemagne: "DE",
  Argentine: "AR",
  Australie: "AU",
  Autriche: "AT",
  Belgique: "BE",
  Bolivie: "BO",
  Brésil: "BR",
  Bulgarie: "BG",
  Cambodge: "KH",
  Canada: "CA",
  Chili: "CL",
  Chine: "CN",
  Colombie: "CO",
  "Corée du Sud": "KR",
  "Costa Rica": "CR",
  Croatie: "HR",
  Cuba: "CU",
  Danemark: "DK",
  Égypte: "EG",
  "Émirats Arabes Unis": "AE",
  Équateur: "EC",
  Espagne: "ES",
  Estonie: "EE",
  "États-Unis": "US",
  Éthiopie: "ET",
  Finlande: "FI",
  France: "FR",
  Géorgie: "GE",
  Grèce: "GR",
  Guatemala: "GT",
  Hongrie: "HU",
  "Île Maurice": "MU",
  Inde: "IN",
  Indonésie: "ID",
  Irlande: "IE",
  Islande: "IS",
  Israël: "IL",
  Italie: "IT",
  Japon: "JP",
  Jordanie: "JO",
  Kenya: "KE",
  Laos: "LA",
  Liban: "LB",
  Madagascar: "MG",
  Malaisie: "MY",
  Maldives: "MV",
  Malte: "MT",
  Maroc: "MA",
  Mexique: "MX",
  Mongolie: "MN",
  Népal: "NP",
  Nicaragua: "NI",
  Norvège: "NO",
  "Nouvelle-Zélande": "NZ",
  Oman: "OM",
  "Pays-Bas": "NL",
  Pérou: "PE",
  Philippines: "PH",
  Pologne: "PL",
  Portugal: "PT",
  "République Dominicaine": "DO",
  Roumanie: "RO",
  "Royaume-Uni": "GB",
  Russie: "RU",
  Sénégal: "SN",
  Serbie: "RS",
  Seychelles: "SC",
  Singapour: "SG",
  Slovaquie: "SK",
  Slovénie: "SI",
  "Sri Lanka": "LK",
  Suède: "SE",
  Suisse: "CH",
  Tanzanie: "TZ",
  Thaïlande: "TH",
  Tunisie: "TN",
  Turquie: "TR",
  Ukraine: "UA",
  Uruguay: "UY",
  Vietnam: "VN",
};

function cleanText(value: unknown, max = 100) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/[<>`{}]/g, " ");
  return Array.from(normalized)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cacheKey(input: GeocodeInput) {
  return `${input.city.toLocaleLowerCase("fr-FR")}|${input.country.toLocaleLowerCase("fr-FR")}`;
}

function normalizeForSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function waitForGeocodingSlot() {
  const run = geocodeQueue.then(async () => {
    const delay = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastExternalRequestAt));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastExternalRequestAt = Date.now();
  });
  geocodeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
}

function getNominatimUrl(input: GeocodeInput, includeCountry: boolean) {
  const baseUrl = process.env.GEOCODING_BASE_URL?.trim() || DEFAULT_GEOCODING_URL;
  const url = new URL(baseUrl);
  url.searchParams.set("q", includeCountry ? `${input.city}, ${input.country}` : input.city);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "10");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "fr");

  const email = process.env.GEOCODING_EMAIL?.trim();
  if (email) url.searchParams.set("email", email);

  return url;
}

function getOpenMeteoUrl(input: GeocodeInput) {
  const url = new URL(OPEN_METEO_GEOCODING_URL);
  url.searchParams.set("name", input.city);
  url.searchParams.set("count", "20");
  url.searchParams.set("language", "fr");
  url.searchParams.set("format", "json");
  return url;
}

function getGeocodingHeaders() {
  const headers = new Headers({
    Accept: "application/json",
    "Accept-Language": "fr,en;q=0.8",
  });
  const appUrl = process.env.PUBLIC_APP_URL?.trim();
  const userAgent =
    process.env.GEOCODING_USER_AGENT?.trim() ||
    `GlobeLink/10.8.14${appUrl ? ` (${appUrl})` : " (local-development)"}`;
  headers.set("User-Agent", userAgent);
  if (appUrl) headers.set("Referer", appUrl);
  return headers;
}

function matchesCountry(
  input: GeocodeInput,
  countryName?: string | null,
  countryCode?: string | null,
) {
  const expectedCode = COUNTRY_CODES[input.country]?.toLocaleLowerCase("en-US");
  if (expectedCode && countryCode?.toLocaleLowerCase("en-US") === expectedCode) return true;
  const normalizedExpectedCountry = normalizeForSearch(input.country);
  const normalizedCountryName = normalizeForSearch(countryName);
  return !!normalizedCountryName && normalizedCountryName === normalizedExpectedCountry;
}

function nominatimScore(input: GeocodeInput, row: NominatimResult) {
  const label = normalizeForSearch(`${row.display_name ?? ""} ${row.name ?? ""}`);
  const city = normalizeForSearch(input.city);
  let score = 0;
  if (label.includes(city)) score += 40;
  if (matchesCountry(input, row.address?.country, row.address?.country_code)) score += 40;
  if (row.class === "place" || row.class === "boundary") score += 12;
  if (
    ["city", "town", "village", "hamlet", "municipality", "administrative"].includes(row.type ?? "")
  )
    score += 8;
  score += Math.min(10, Math.max(0, Number(row.importance ?? 0) * 10));
  return score;
}

function parseNominatimResult(raw: unknown, input: GeocodeInput): GeocodeResult | null {
  const rows = Array.isArray(raw) ? (raw as NominatimResult[]) : [];
  const candidates = rows
    .map((row) => ({ row, score: nominatimScore(input, row) }))
    .filter(({ row, score }) => {
      const expectedCode = COUNTRY_CODES[input.country];
      if (!expectedCode) return score > 0;
      return matchesCountry(input, row.address?.country, row.address?.country_code);
    })
    .sort((a, b) => b.score - a.score);

  for (const { row } of candidates) {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180
    ) {
      return {
        lat,
        lng,
        label: cleanText(row.display_name || row.name || "Position détectée", 250),
        provider: "nominatim",
        cached: false,
      };
    }
  }
  return null;
}

function parseOpenMeteoResult(raw: unknown, input: GeocodeInput): GeocodeResult | null {
  const rows = (raw as OpenMeteoResult)?.results ?? [];
  const expectedCode = COUNTRY_CODES[input.country];
  const candidates = rows
    .filter((row) =>
      expectedCode
        ? row.country_code?.toLocaleUpperCase("en-US") === expectedCode
        : matchesCountry(input, row.country, row.country_code),
    )
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude));

  for (const row of candidates) {
    const parts = [row.name, row.admin3, row.admin2, row.admin1, row.country].filter(Boolean);
    return {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      label: cleanText(parts.join(", ") || "Position détectée", 250),
      provider: "open-meteo",
      cached: false,
    };
  }
  return null;
}

async function geocodeWithNominatim(input: GeocodeInput) {
  for (const includeCountry of [true, false]) {
    await waitForGeocodingSlot();

    const response = await fetch(getNominatimUrl(input, includeCountry), {
      headers: getGeocodingHeaders(),
    });
    if (!response.ok) continue;

    const result = parseNominatimResult(await response.json(), input);
    if (result) return result;
  }

  return null;
}

async function geocodeWithOpenMeteo(input: GeocodeInput) {
  await waitForGeocodingSlot();

  const response = await fetch(getOpenMeteoUrl(input), { headers: getGeocodingHeaders() });
  if (!response.ok) return null;

  return parseOpenMeteoResult(await response.json(), input);
}

export async function geocodeCityForServer(input: GeocodeInput) {
  const nominatimResult = await geocodeWithNominatim(input);
  if (nominatimResult) return nominatimResult;

  const openMeteoResult = await geocodeWithOpenMeteo(input);
  if (openMeteoResult) return openMeteoResult;

  throw new Error(
    "Ville introuvable automatiquement. Essaie le nom officiel, la commune voisine, ou utilise ta position.",
  );
}

export const geocodePlaceLocation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown): GeocodeInput => {
    const data = raw as Partial<GeocodeInput>;
    const city = cleanText(data.city, 100);
    if (city.length < 1) throw new Error("Ville invalide.");

    const country = cleanText(data.country, 80);
    if (!COUNTRY_SET.has(country)) throw new Error("Pays invalide.");

    return { city, country };
  })
  .handler(async ({ data }) => {
    const key = cacheKey(data);
    const cached = geocodeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }

    const result = await geocodeCityForServer(data);
    geocodeCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  });
