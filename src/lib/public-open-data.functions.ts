import { createServerFn } from "@tanstack/react-start";

export type PublicWeatherInput = {
  latitude: number;
  longitude: number;
};

export type PublicWeather = {
  temperatureC: number;
  feelsLikeC: number | null;
  humidityPercent: number | null;
  windKmh: number | null;
  precipitationMm: number | null;
  summary: string;
  symbolCode: string | null;
  observedAt: string;
  source: "MET Norway";
  sourceUrl: string;
};

export type PublicExchangeRateInput = {
  base: string;
  quote: string;
};

export type PublicExchangeRate = {
  base: string;
  quote: string;
  rate: number;
  date: string;
  source: "Frankfurter";
  sourceUrl: string;
};

type CacheEntry<T> = { expires: number; value: T };

const WEATHER_TTL_MS = 20 * 60_000;
const FX_TTL_MS = 6 * 60 * 60_000;
const weatherCache = new Map<string, CacheEntry<PublicWeather>>();
const fxCache = new Map<string, CacheEntry<PublicExchangeRate>>();
const MET_USER_AGENT = "GlobeLink/11.0 github.com/wassimvare/globelink";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateCoordinates(raw: Partial<PublicWeatherInput>): PublicWeatherInput {
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error("Latitude invalide");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Longitude invalide");
  }
  return { latitude, longitude };
}

function currencyCode(value: unknown) {
  const code = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Code monnaie invalide");
  return code;
}

function validateRate(raw: Partial<PublicExchangeRateInput>): PublicExchangeRateInput {
  return { base: currencyCode(raw.base), quote: currencyCode(raw.quote) };
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...headers },
    });
    if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function weatherLabel(symbolCode: string | null) {
  const symbol = String(symbolCode ?? "")
    .replace(/_(day|night|polartwilight)$/i, "")
    .toLowerCase();
  if (!symbol) return "Conditions variables";
  if (symbol.includes("thunder")) return "Orages";
  if (symbol.includes("heavyrain")) return "Forte pluie";
  if (symbol.includes("rainshowers")) return "Averses";
  if (symbol.includes("rain")) return "Pluie";
  if (symbol.includes("heavysnow")) return "Fortes chutes de neige";
  if (symbol.includes("snow")) return "Neige";
  if (symbol.includes("sleet")) return "Neige fondue";
  if (symbol.includes("fog")) return "Brouillard";
  if (symbol.includes("cloudy")) return "Nuageux";
  if (symbol.includes("partlycloudy")) return "Partiellement nuageux";
  if (symbol.includes("fair")) return "Peu nuageux";
  if (symbol.includes("clearsky")) return "Dégagé";
  return "Conditions variables";
}

export const getPublicWeather = createServerFn({ method: "GET" })
  .validator((raw: unknown) => validateCoordinates((raw ?? {}) as Partial<PublicWeatherInput>))
  .handler(async ({ data }) => {
    const key = `${data.latitude.toFixed(3)},${data.longitude.toFixed(3)}`;
    const cached = weatherCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    url.searchParams.set("lat", data.latitude.toFixed(4));
    url.searchParams.set("lon", data.longitude.toFixed(4));
    const json = asRecord(await fetchJson(url.toString(), { "User-Agent": MET_USER_AGENT }));
    const properties = asRecord(json.properties);
    const timeseries = Array.isArray(properties.timeseries) ? properties.timeseries : [];
    const point = asRecord(timeseries[0]);
    const pointData = asRecord(point.data);
    const instant = asRecord(pointData.instant);
    const details = asRecord(instant.details);
    const nextHour = asRecord(pointData.next_1_hours);
    const nextHourSummary = asRecord(nextHour.summary);
    const nextHourDetails = asRecord(nextHour.details);

    const temperatureC = finiteNumber(details.air_temperature);
    if (temperatureC == null) throw new Error("MET Norway: température indisponible");
    const humidityPercent = finiteNumber(details.relative_humidity);
    const windMs = finiteNumber(details.wind_speed);
    const precipitationMm = finiteNumber(nextHourDetails.precipitation_amount);
    const symbolCode =
      typeof nextHourSummary.symbol_code === "string" ? nextHourSummary.symbol_code : null;

    // MET Locationforecast ne fournit pas toujours une température ressentie directement.
    // On laisse null au lieu d'inventer une valeur.
    const result: PublicWeather = {
      temperatureC,
      feelsLikeC: null,
      humidityPercent,
      windKmh: windMs == null ? null : Math.round(windMs * 36) / 10,
      precipitationMm,
      summary: weatherLabel(symbolCode),
      symbolCode,
      observedAt: typeof point.time === "string" ? point.time : new Date().toISOString(),
      source: "MET Norway",
      sourceUrl: "https://api.met.no/",
    };
    weatherCache.set(key, { expires: Date.now() + WEATHER_TTL_MS, value: result });
    return result;
  });

export const getPublicExchangeRate = createServerFn({ method: "GET" })
  .validator((raw: unknown) => validateRate((raw ?? {}) as Partial<PublicExchangeRateInput>))
  .handler(async ({ data }) => {
    if (data.base === data.quote) {
      return {
        base: data.base,
        quote: data.quote,
        rate: 1,
        date: new Date().toISOString().slice(0, 10),
        source: "Frankfurter",
        sourceUrl: "https://frankfurter.dev/",
      } satisfies PublicExchangeRate;
    }

    const key = `${data.base}/${data.quote}`;
    const cached = fxCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;

    const url = `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(data.base)}/${encodeURIComponent(data.quote)}`;
    const json = asRecord(await fetchJson(url));
    const rate = finiteNumber(json.rate);
    if (rate == null || rate <= 0) throw new Error("Frankfurter: taux indisponible");
    const result: PublicExchangeRate = {
      base: typeof json.base === "string" ? json.base : data.base,
      quote: typeof json.quote === "string" ? json.quote : data.quote,
      rate,
      date: typeof json.date === "string" ? json.date : new Date().toISOString().slice(0, 10),
      source: "Frankfurter",
      sourceUrl: "https://frankfurter.dev/",
    };
    fxCache.set(key, { expires: Date.now() + FX_TTL_MS, value: result });
    return result;
  });
