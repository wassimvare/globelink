import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createServerClient } from "@/integrations/supabase/client.server";

const FORECAST_PAST_DAYS = 5;
const FORECAST_FUTURE_DAYS = 16;
const SEASONAL_HISTORY_YEARS = 5;

type RawWeather = {
  code: number;
  max: number;
  min: number;
};

type StoredWeather = {
  icon: string;
  temp: number;
  summary: string;
  source: "forecast" | "historical" | "seasonal";
};

function weatherEmoji(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "⛅️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "⛅️";
}

function utcDay(value = new Date()) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function isoDayTimestamp(day: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return null;
  return parsed.getTime();
}

export function weatherModeForDay(day: string, now = new Date()) {
  const target = isoDayTimestamp(day);
  if (target == null) return "unavailable" as const;
  const distance = Math.round((target - utcDay(now)) / 86_400_000);
  if (distance < -FORECAST_PAST_DAYS) return "historical" as const;
  if (distance <= FORECAST_FUTURE_DAYS) return "forecast" as const;
  return "seasonal" as const;
}

async function geocode(city: string, country?: string | null) {
  const query = [city, country].filter(Boolean).join(", ");
  if (!query) return null;
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`,
    { signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) return null;
  const json = await response.json();
  const row = json?.results?.[0];
  const lat = Number(row?.latitude);
  const lng = Number(row?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function fetchDailyWeather(endpoint: string): Promise<RawWeather | null> {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return null;
  const json = await response.json();
  const code = Number(json?.daily?.weather_code?.[0]);
  const max = Number(json?.daily?.temperature_2m_max?.[0]);
  const min = Number(json?.daily?.temperature_2m_min?.[0]);
  if (!Number.isFinite(code) || !Number.isFinite(max) || !Number.isFinite(min)) return null;
  return { code, max, min };
}

async function fetchForecastWeather(lat: number, lng: number, day: string) {
  const endpoint =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lng))}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&start_date=${encodeURIComponent(day)}&end_date=${encodeURIComponent(day)}`;
  return fetchDailyWeather(endpoint);
}

async function fetchHistoricalWeather(lat: number, lng: number, day: string) {
  const endpoint =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lng))}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&start_date=${encodeURIComponent(day)}&end_date=${encodeURIComponent(day)}`;
  return fetchDailyWeather(endpoint);
}

function equivalentHistoricalDay(targetDay: string, year: number) {
  const monthDay = targetDay.slice(4);
  const candidate = `${year}${monthDay}`;
  return isoDayTimestamp(candidate) == null ? null : candidate;
}

function representativeEmoji(readings: RawWeather[]) {
  const counts = new Map<string, number>();
  for (const reading of readings) {
    const icon = weatherEmoji(reading.code);
    counts.set(icon, (counts.get(icon) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "⛅️";
}

function averageTemperature(readings: RawWeather[]) {
  const average =
    readings.reduce((sum, reading) => sum + (reading.max + reading.min) / 2, 0) / readings.length;
  return Math.round(average * 10) / 10;
}

async function fetchSeasonalWeatherEstimate(lat: number, lng: number, day: string) {
  const currentYear = new Date().getUTCFullYear();
  const samples = Array.from({ length: SEASONAL_HISTORY_YEARS }, (_, index) => currentYear - index - 1)
    .map((year) => ({ year, day: equivalentHistoricalDay(day, year) }))
    .filter((item): item is { year: number; day: string } => !!item.day);

  const results = await Promise.allSettled(
    samples.map(async (sample) => ({ sample, weather: await fetchHistoricalWeather(lat, lng, sample.day) })),
  );
  const available = results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value.weather) return [];
    return [result.value];
  });
  if (!available.length) return null;

  const readings = available.map((item) => item.weather);
  const years = available.map((item) => item.sample.year).sort((a, b) => a - b);
  return {
    icon: representativeEmoji(readings),
    temp: averageTemperature(readings),
    summary:
      years.length > 1
        ? `Tendance saisonnière estimée · moyenne historique ${years[0]}–${years[years.length - 1]}`
        : `Tendance saisonnière estimée · référence historique ${years[0]}`,
    source: "seasonal" as const,
  };
}

async function fetchWeatherForDay(lat: number, lng: number, day: string): Promise<StoredWeather | null> {
  const mode = weatherModeForDay(day);
  if (mode === "unavailable") return null;

  if (mode === "seasonal") {
    return fetchSeasonalWeatherEstimate(lat, lng, day);
  }

  const raw =
    mode === "historical"
      ? await fetchHistoricalWeather(lat, lng, day)
      : await fetchForecastWeather(lat, lng, day);
  if (!raw) return null;

  return {
    icon: weatherEmoji(raw.code),
    temp: Math.round(((raw.max + raw.min) / 2) * 10) / 10,
    summary: mode === "historical" ? "Météo observée pour cette date" : "Prévision météo",
    source: mode,
  };
}

export const refreshTripDayWeather = createServerFn({ method: "POST" })
  .inputValidator((input: { tripId: string; day: string }) => input)
  .handler(async ({ data }) => {
    const supabase = createServerClient(getRequest());
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Non connecté.");

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("id,user_id,city,country")
      .eq("id", data.tripId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (tripError) throw tripError;
    if (!trip) throw new Error("Voyage introuvable.");

    const location = await geocode(trip.city || trip.country || "", trip.city ? trip.country : null);
    if (!location) return { ok: false as const, reason: "location_unavailable" as const };

    const weather = await fetchWeatherForDay(location.lat, location.lng, data.day);
    if (!weather) return { ok: false as const, reason: "weather_unavailable" as const };

    const { data: saved, error } = await supabase
      .from("trip_days")
      .upsert(
        {
          trip_id: data.tripId,
          user_id: user.id,
          day_date: data.day,
          weather_icon: weather.icon,
          weather_temp: weather.temp,
          weather_summary: weather.summary,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id,day_date" },
      )
      .select("weather_icon,weather_temp,weather_summary")
      .single();
    if (error) throw error;

    return {
      ok: true as const,
      icon: saved.weather_icon ?? weather.icon,
      temp: saved.weather_temp == null ? weather.temp : Number(saved.weather_temp),
      summary: saved.weather_summary ?? weather.summary,
      source: weather.source,
    };
  });
