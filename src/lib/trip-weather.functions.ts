import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FORECAST_PAST_DAYS = 5;
const FORECAST_FUTURE_DAYS = 16;
const SEASONAL_HISTORY_YEARS = 5;

const weatherCache = new Map<string, { expiresAt: number; value: TripDayWeather }>();

type WeatherSource = "forecast" | "historical" | "seasonal";

type TripDayWeather = {
  icon: string;
  label: string;
  temperature: number;
  temperatureMin: number | null;
  temperatureMax: number;
  summary: string;
  source: WeatherSource;
};

type DailyWeatherPayload = {
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

function weatherFromCode(code: number): Pick<TripDayWeather, "icon" | "label"> {
  if (code === 0) return { icon: "☀️", label: "Ensoleillé" };
  if ([1, 2].includes(code)) return { icon: "⛅️", label: "Éclaircies" };
  if (code === 3) return { icon: "☁️", label: "Nuageux" };
  if ([45, 48].includes(code)) return { icon: "🌫️", label: "Brume" };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { icon: "🌧️", label: "Pluie" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: "❄️", label: "Neige" };
  if ([95, 96, 99].includes(code)) return { icon: "⛈️", label: "Orage" };
  return { icon: "⛅️", label: "Variable" };
}

function isoDayTimestamp(day: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  return parsed.getTime();
}

function utcTodayTimestamp(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function weatherModeForDay(day: string, now = new Date()) {
  const target = isoDayTimestamp(day);
  if (target == null) return "unavailable" as const;
  const distance = Math.round((target - utcTodayTimestamp(now)) / 86_400_000);
  if (distance < -FORECAST_PAST_DAYS) return "historical" as const;
  if (distance <= FORECAST_FUTURE_DAYS) return "forecast" as const;
  return "seasonal" as const;
}

async function fetchJson(url: string, timeoutMs = 7_500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`WEATHER_HTTP_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function weatherFromPayload(
  payload: DailyWeatherPayload,
  source: Exclude<WeatherSource, "seasonal">,
): TripDayWeather | null {
  const code = Number(payload.daily?.weather_code?.[0]);
  const max = Number(payload.daily?.temperature_2m_max?.[0]);
  const rawMin = payload.daily?.temperature_2m_min?.[0];
  const min = rawMin == null ? null : Number(rawMin);
  if (!Number.isFinite(code) || !Number.isFinite(max)) return null;

  const condition = weatherFromCode(code);
  const temperature = Math.round(Number.isFinite(min) ? (max + Number(min)) / 2 : max);
  return {
    ...condition,
    temperature,
    temperatureMin: Number.isFinite(min) ? Number(min) : null,
    temperatureMax: max,
    summary: source === "historical" ? "Météo observée pour cette date" : "Prévision météo",
    source,
  };
}

function dailyWeatherUrl(
  base: "forecast" | "archive",
  latitude: number,
  longitude: number,
  day: string,
) {
  const url = new URL(
    base === "forecast"
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive",
  );
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", day);
  url.searchParams.set("end_date", day);
  return url.toString();
}

async function fetchForecastWeather(latitude: number, longitude: number, day: string) {
  const payload = (await fetchJson(dailyWeatherUrl("forecast", latitude, longitude, day))) as DailyWeatherPayload;
  return weatherFromPayload(payload, "forecast");
}

async function fetchHistoricalWeather(latitude: number, longitude: number, day: string) {
  const payload = (await fetchJson(dailyWeatherUrl("archive", latitude, longitude, day))) as DailyWeatherPayload;
  return weatherFromPayload(payload, "historical");
}

function equivalentHistoricalDay(targetDay: string, year: number) {
  const candidate = `${year}${targetDay.slice(4)}`;
  return isoDayTimestamp(candidate) == null ? null : candidate;
}

function representativeCondition(readings: TripDayWeather[]) {
  const groups = new Map<string, { count: number; icon: string; label: string }>();
  for (const reading of readings) {
    const current = groups.get(reading.icon);
    if (current) current.count += 1;
    else groups.set(reading.icon, { count: 1, icon: reading.icon, label: reading.label });
  }
  return [...groups.values()].sort((left, right) => right.count - left.count)[0] ?? {
    icon: "⛅️",
    label: "Variable",
  };
}

async function fetchSeasonalWeather(latitude: number, longitude: number, day: string) {
  const currentYear = new Date().getUTCFullYear();
  const samples = Array.from({ length: SEASONAL_HISTORY_YEARS }, (_, index) => currentYear - index - 1)
    .map((year) => ({ year, day: equivalentHistoricalDay(day, year) }))
    .filter((sample): sample is { year: number; day: string } => !!sample.day);

  const settled = await Promise.allSettled(
    samples.map(async (sample) => ({
      sample,
      weather: await fetchHistoricalWeather(latitude, longitude, sample.day),
    })),
  );

  const available: Array<{ sample: { year: number; day: string }; weather: TripDayWeather }> = [];
  for (const result of settled) {
    if (result.status !== "fulfilled" || !result.value.weather) continue;
    available.push({ sample: result.value.sample, weather: result.value.weather });
  }
  if (!available.length) return null;

  const readings = available.map((item) => item.weather);
  const years = available.map((item) => item.sample.year).sort((left, right) => left - right);
  const condition = representativeCondition(readings);
  const temperature = Math.round(
    readings.reduce((sum, reading) => sum + reading.temperature, 0) / readings.length,
  );
  const mins = readings
    .map((reading) => reading.temperatureMin)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const maxes = readings.map((reading) => reading.temperatureMax).filter(Number.isFinite);

  return {
    ...condition,
    temperature,
    temperatureMin: mins.length
      ? Math.round((mins.reduce((sum, value) => sum + value, 0) / mins.length) * 10) / 10
      : null,
    temperatureMax: maxes.length
      ? Math.round((maxes.reduce((sum, value) => sum + value, 0) / maxes.length) * 10) / 10
      : temperature,
    summary:
      years.length > 1
        ? `Tendance saisonnière estimée · moyenne historique ${years[0]}–${years[years.length - 1]}`
        : `Tendance saisonnière estimée · référence historique ${years[0]}`,
    source: "seasonal" as const,
  } satisfies TripDayWeather;
}

async function fetchWeatherForDay(latitude: number, longitude: number, day: string) {
  const mode = weatherModeForDay(day);
  if (mode === "unavailable") return null;
  if (mode === "seasonal") return fetchSeasonalWeather(latitude, longitude, day);
  if (mode === "historical") return fetchHistoricalWeather(latitude, longitude, day);
  return fetchForecastWeather(latitude, longitude, day);
}

export const refreshTripDayWeather = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const data = input as { tripId?: unknown; day?: unknown };
    const tripId = String(data.tripId ?? "").trim();
    const day = String(data.day ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new Error("Voyage invalide.");
    if (!DAY_RE.test(day) || isoDayTimestamp(day) == null) throw new Error("Date météo invalide.");
    return { tripId, day };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: trip, error: tripError } = await db
      .from("trips")
      .select("id,city,country,starts_on,ends_on")
      .eq("id", data.tripId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (tripError || !trip) throw new Error("Voyage introuvable.");

    const destination = [trip.city, trip.country].filter(Boolean).join(", ").trim();
    if (!destination) throw new Error("Ajoute une destination au voyage pour afficher la météo.");

    const cacheKey = `${destination.toLocaleLowerCase("fr-FR")}:${data.day}`;
    const cached = weatherCache.get(cacheKey);
    let weather = cached && cached.expiresAt > Date.now() ? cached.value : null;

    if (!weather) {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", destination);
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "fr");
      geoUrl.searchParams.set("format", "json");
      const geo = (await fetchJson(geoUrl.toString())) as {
        results?: Array<{ latitude?: number; longitude?: number }>;
      };
      const point = geo.results?.[0];
      if (!point || !Number.isFinite(Number(point.latitude)) || !Number.isFinite(Number(point.longitude))) {
        throw new Error("Météo indisponible pour cette destination.");
      }

      weather = await fetchWeatherForDay(Number(point.latitude), Number(point.longitude), data.day);
      if (!weather) throw new Error("Météo non disponible pour cette date.");

      const cacheDuration = weather.source === "seasonal" ? 24 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000;
      weatherCache.set(cacheKey, { expiresAt: Date.now() + cacheDuration, value: weather });
      if (weatherCache.size > 300) {
        const oldest = weatherCache.keys().next().value;
        if (oldest) weatherCache.delete(oldest);
      }
    }

    const { data: saved, error: dayError } = await db
      .from("trip_days")
      .upsert(
        {
          trip_id: trip.id,
          user_id: context.userId,
          day_date: data.day,
          weather_icon: weather.icon,
          weather_temp: weather.temperature,
          weather_summary: weather.summary,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id,day_date" },
      )
      .select("weather_icon,weather_temp,weather_summary")
      .single();
    if (dayError || !saved) throw new Error("Impossible d’enregistrer la météo de cette journée.");

    return {
      ...weather,
      icon: saved.weather_icon ?? weather.icon,
      temperature: saved.weather_temp == null ? weather.temperature : Number(saved.weather_temp),
      summary: saved.weather_summary ?? weather.summary,
    };
  });
