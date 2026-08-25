// Travelers that GlobeLink has actually localised: either their profile
// location (country) is set, or they have a public trip covering today.
// Coordinates are derived from the country centre with a deterministic
// per-user jitter so markers don't stack on the exact same pixel.
import { supabase } from "@/integrations/supabase/client";
import { COUNTRY_BY_NAME } from "@/lib/country-info";
import { getSuggestionExcludedUserIds } from "@/lib/account-settings";

export type LocatedTraveler = {
  id: string;
  username: string;
  name: string;
  avatar: string | null;
  lat: number;
  lng: number;
  city: string;
  country: string;
  starts_on: string | null;
  ends_on: string | null;
  budget_eur: number | null;
  languages: string[];
  interests: string[];
  bio: string;
  source: "trip" | "profile";
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function coordsFor(id: string, country: string, city?: string | null): [number, number] | null {
  const base = COUNTRY_BY_NAME.get(country.trim().toLowerCase())?.center ?? null;
  if (!base) return null;
  const h = hash(id);
  const jLat = ((h % 1000) / 1000 - 0.5) * 1.4;
  const jLng = (((h >> 10) % 1000) / 1000 - 0.5) * 1.4;
  return [base[0] + jLat, base[1] + jLng];
}

export async function fetchLocatedTravelers(): Promise<LocatedTraveler[]> {
  const today = new Date().toISOString().slice(0, 10);
  const authResult = await supabase.auth.getUser();
  const currentUserId = authResult.data.user?.id ?? null;

  const [tripsRes, profilesRes, excluded] = await Promise.all([
    supabase
      .from("travel_intents")
      .select(
        "user_id, destination_country, destination_city, starts_on, ends_on, budget_eur, languages, interests, bio",
      )
      .eq("visibility", "public")
      .lte("starts_on", today)
      .gte("ends_on", today)
      .limit(400),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, country, bio, languages")
      .eq("status", "active")
      .neq("visibility", "hidden")
      .not("country", "is", null)
      .limit(400),
    currentUserId ? getSuggestionExcludedUserIds(currentUserId) : Promise.resolve(new Set<string>()),
  ]);

  const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  const out = new Map<string, LocatedTraveler>();

  for (const t of tripsRes.data ?? []) {
    if (t.user_id === currentUserId || excluded.has(t.user_id)) continue;
    const p = profiles.get(t.user_id);
    if (!p) continue;
    const co = coordsFor(t.user_id, t.destination_country, t.destination_city);
    if (!co) continue;
    out.set(t.user_id, {
      id: t.user_id,
      username: p.username,
      name: p.display_name ?? p.username,
      avatar: p.avatar_url,
      lat: co[0],
      lng: co[1],
      city: t.destination_city ?? "",
      country: t.destination_country,
      starts_on: t.starts_on,
      ends_on: t.ends_on,
      budget_eur: t.budget_eur,
      languages: t.languages ?? [],
      interests: t.interests ?? [],
      bio: t.bio ?? p.bio ?? "",
      source: "trip",
    });
  }

  for (const p of profilesRes.data ?? []) {
    if (p.id === currentUserId || excluded.has(p.id) || out.has(p.id) || !p.country) continue;
    const co = coordsFor(p.id, p.country, null);
    if (!co) continue;
    out.set(p.id, {
      id: p.id,
      username: p.username,
      name: p.display_name ?? p.username,
      avatar: p.avatar_url,
      lat: co[0],
      lng: co[1],
      city: "",
      country: p.country,
      starts_on: null,
      ends_on: null,
      budget_eur: null,
      languages: p.languages ?? [],
      interests: [],
      bio: p.bio ?? "",
      source: "profile",
    });
  }

  return Array.from(out.values());
}
