import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { isInternalJournalEntry } from "@/features/travel/day-program";
import { buildTripDateRange } from "@/features/travel/trip-journey";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const finalizeTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): { tripId: string } => {
    const x = d as { tripId?: string };
    if (!x?.tripId) throw new Error("tripId requis");
    return { tripId: x.tripId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: trip } = await supabase
      .from("trips")
      .select("*")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip || trip.user_id !== userId) throw new Error("Voyage introuvable");

    const [{ data: entries }, { data: expenses }, { data: days }] = await Promise.all([
      supabase
        .from("trip_entries")
        .select("*")
        .eq("trip_id", data.tripId)
        .order("visited_on", { ascending: true })
        .order("position"),
      supabase.from("trip_expenses").select("*").eq("trip_id", data.tripId),
      supabase.from("trip_days").select("*").eq("trip_id", data.tripId).order("day_date"),
    ]);

    const userEntries = (entries ?? []).filter((entry) => !isInternalJournalEntry(entry));
    const actualExpenses = (expenses ?? []).filter(
      (expense) => expense.category !== "Prévision IA+",
    );
    const geo = userEntries.filter((e) => e.lat != null && e.lng != null) as Array<{
      lat: number;
      lng: number;
      country: string | null;
    }>;
    let distanceKm = 0;
    for (let i = 1; i < geo.length; i++) distanceKm += haversineKm(geo[i - 1], geo[i]);

    const countries = new Set(userEntries.map((e) => e.country).filter(Boolean));
    if (trip.country) countries.add(trip.country);

    const photosCount =
      userEntries.reduce((n, e) => n + (e.media_urls?.length ?? 0), 0) +
      userEntries.filter((e) => e.image_url).length;
    const spent = actualExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const activities = userEntries.filter((e) => e.kind === "activity").length;
    const restaurants = userEntries.filter((e) => e.kind === "restaurant").length;
    const hotels = userEntries.filter((e) => e.kind === "hotel").length;
    const daySet = new Set<string>();
    buildTripDateRange(trip.starts_on, trip.ends_on, 366).forEach((day) => daySet.add(day));
    (days ?? []).forEach((day) => day.day_date && daySet.add(day.day_date));
    userEntries.forEach((entry) => entry.visited_on && daySet.add(entry.visited_on));
    actualExpenses.forEach((expense) => expense.spent_on && daySet.add(expense.spent_on));

    const stats = {
      distance_km: Math.round(distanceKm),
      countries_count: countries.size,
      entries_count: userEntries.length,
      days_count: daySet.size,
      photos_count: photosCount,
      expenses_total: Number(spent.toFixed(2)),
      activities_count: activities,
      restaurants_count: restaurants,
      hotels_count: hotels,
      route: geo.map((g) => [g.lat, g.lng]),
    };

    // AI summary
    let summary = trip.summary ?? "";
    try {
      const key = process.env.LOVABLE_API_KEY;
      if (key) {
        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");
        const digest = {
          trip: { title: trip.title, country: trip.country, city: trip.city },
          stats,
          highlights: userEntries.slice(0, 40).map((e) => ({
            day: e.visited_on,
            kind: e.kind,
            title: e.title,
            city: e.city,
            notes: e.notes?.slice(0, 200),
            rating: e.rating,
          })),
          moods: (days ?? []).map((d) => ({ day: d.day_date, mood: d.mood, headline: d.headline })),
        };
        const { text } = await generateText({
          model,
          prompt: `Tu es un rédacteur de carnet de voyage. À partir de ces données JSON, écris en français un résumé chaleureux et vivant du voyage en 4 paragraphes (150-220 mots). Termine par une citation courte inspirante en italique. Utilise du Markdown.\n\nDonnées :\n${JSON.stringify(digest)}`,
        });
        summary = text;
      }
    } catch {
      /* soft-fail summary */
    }

    const { error: finalizeError } = await supabase
      .from("trips")
      .update({
        status: "past",
        stats: stats as never,
        summary,
        finalized_at: new Date().toISOString(),
      })
      .eq("id", data.tripId)
      .eq("user_id", userId);

    if (finalizeError) throw finalizeError;

    return { ok: true, stats, summary };
  });
