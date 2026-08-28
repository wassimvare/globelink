import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const weatherCache = new Map<string, { expiresAt: number; value: TripDayWeather }>();

type TripDayWeather = {
  icon: string;
  label: string;
  temperature: number;
  temperatureMin: number | null;
  temperatureMax: number;
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

export const refreshTripDayWeather = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const data = input as { tripId?: unknown; day?: unknown };
    const tripId = String(data.tripId ?? "").trim();
    const day = String(data.day ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) throw new Error("Voyage invalide.");
    if (!DAY_RE.test(day)) throw new Error("Date météo invalide.");
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

    const destination = String(trip.city || trip.country || "").trim();
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

      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.searchParams.set("latitude", String(point.latitude));
      forecastUrl.searchParams.set("longitude", String(point.longitude));
      forecastUrl.searchParams.set(
        "daily",
        "weather_code,temperature_2m_max,temperature_2m_min",
      );
      forecastUrl.searchParams.set("timezone", "auto");
      forecastUrl.searchParams.set("start_date", data.day);
      forecastUrl.searchParams.set("end_date", data.day);
      const payload = (await fetchJson(forecastUrl.toString())) as {
        daily?: {
          weather_code?: number[];
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
        };
      };

      const code = Number(payload.daily?.weather_code?.[0]);
      const max = Number(payload.daily?.temperature_2m_max?.[0]);
      const rawMin = payload.daily?.temperature_2m_min?.[0];
      const min = rawMin == null ? null : Number(rawMin);
      if (!Number.isFinite(code) || !Number.isFinite(max)) {
        throw new Error("Prévision météo non disponible pour cette date.");
      }

      const condition = weatherFromCode(code);
      const temperature = Math.round(Number.isFinite(min) ? (max + Number(min)) / 2 : max);
      weather = {
        ...condition,
        temperature,
        temperatureMin: Number.isFinite(min) ? Number(min) : null,
        temperatureMax: max,
      };
      weatherCache.set(cacheKey, { expiresAt: Date.now() + 3 * 60 * 60 * 1000, value: weather });
      if (weatherCache.size > 300) {
        const oldest = weatherCache.keys().next().value;
        if (oldest) weatherCache.delete(oldest);
      }
    }

    const { error: dayError } = await db.from("trip_days").upsert(
      {
        trip_id: trip.id,
        user_id: context.userId,
        day_date: data.day,
        weather_icon: weather.icon,
        weather_temp: weather.temperature,
      },
      { onConflict: "trip_id,day_date" },
    );
    if (dayError) throw new Error("Impossible d’enregistrer la météo de cette journée.");

    return weather;
  });
