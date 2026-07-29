// Universal search: aggregates users, destinations, activities, posts,
// hotels, restaurants, journals (trips) and community questions.
import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES } from "./countries";
import { MOCK_PLACES } from "./mock-places";
import { POPULAR_ACTIVITIES, COMMUNITY_QUESTIONS, TRENDING_DESTINATIONS } from "./mock-home";

export type SearchKind =
  | "user"
  | "destination"
  | "activity"
  | "post"
  | "hotel"
  | "restaurant"
  | "trip"
  | "question";

export type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  image?: string;
  to: string; // navigation target
  score: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function scoreOf(hay: string, q: string): number {
  const h = norm(hay);
  const n = norm(q);
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(` ${n}`)) return 60;
  if (h.includes(n)) return 40;
  return 0;
}

function best(q: string, ...fields: (string | undefined | null)[]): number {
  let m = 0;
  for (const f of fields) if (f) m = Math.max(m, scoreOf(f, q));
  return m;
}

export async function universalSearch(query: string, limit = 8): Promise<Record<SearchKind, SearchResult[]>> {
  const q = query.trim();
  const empty: Record<SearchKind, SearchResult[]> = {
    user: [], destination: [], activity: [], post: [], hotel: [], restaurant: [], trip: [], question: [],
  };
  if (!q) return empty;

  // ---- Destinations (countries + trending cities) ----
  const destinations: SearchResult[] = [];
  for (const country of COUNTRIES) {
    const s = scoreOf(country, q);
    if (s) destinations.push({ id: `country-${country}`, kind: "destination", title: country, subtitle: "Pays", to: "/map", score: s });
  }
  for (const d of TRENDING_DESTINATIONS) {
    const s = best(q, d.name, d.country, d.tag);
    if (s) destinations.push({ id: `dest-${d.name}`, kind: "destination", title: d.name, subtitle: `${d.country} · ${d.tag}`, image: d.image, to: "/map", score: s + 5 });
  }

  // ---- Activities, hotels, restaurants (from MOCK_PLACES + curated) ----
  const activities: SearchResult[] = [];
  const hotels: SearchResult[] = [];
  const restaurants: SearchResult[] = [];

  for (const a of POPULAR_ACTIVITIES) {
    const s = best(q, a.title, a.place);
    if (s) activities.push({ id: `act-${a.slug}`, kind: "activity", title: a.title, subtitle: `${a.place} · ★ ${a.rating}`, image: a.image, to: `/activities/${a.slug}`, score: s });
  }

  // Category keyword detection (fr/en singular+plural)
  const nq = norm(q);
  const catHit = (kw: string[]) => kw.some((k) => nq === k || nq.includes(k));
  const wantRestaurants = catHit(["restaurant", "restaurants", "resto", "restos", "manger", "food"]);
  const wantHotels = catHit(["hotel", "hotels", "hébergement", "hebergement", "logement"]);

  for (const p of MOCK_PLACES) {
    const nameScore = best(q, p.name, p.city, p.country);
    const cityCountryScore = best(q, p.city, p.country);
    let s = nameScore;
    // If the query matches a city/country, all restaurants & hotels of that place are relevant.
    if (!s && cityCountryScore && (p.category === "restaurant" || p.category === "hotel")) {
      s = Math.max(20, cityCountryScore - 20);
    }
    // If the query is a category keyword, include all matching places (lower score so name matches win).
    if (!s && ((wantRestaurants && p.category === "restaurant") || (wantHotels && p.category === "hotel"))) {
      s = 15;
    }
    if (!s) continue;
    const base: SearchResult = { id: p.id, kind: "activity", title: p.name, subtitle: `${p.city}, ${p.country} · ★ ${p.rating}`, image: p.image_url, to: "/map", score: s };
    if (p.category === "hotel") hotels.push({ ...base, kind: "hotel" });
    else if (p.category === "restaurant") restaurants.push({ ...base, kind: "restaurant" });
    else if (["activite", "randonnee", "plongee", "photospot", "musee", "cascade", "plage", "event"].includes(p.category)) activities.push(base);
  }

  // ---- Questions ----
  const questions: SearchResult[] = COMMUNITY_QUESTIONS.map((c, i) => {
    const s = best(q, c.q, c.country, c.author);
    return s ? { id: `q-${i}`, kind: "question" as const, title: c.q, subtitle: `${c.answers} réponses · ${c.country}`, to: `/questions/${c.slug}`, score: s } : null;
  }).filter(Boolean) as SearchResult[];

  // ---- Supabase in parallel: users, posts, trips ----
  const like = `%${q}%`;
  const [uRes, pRes, tRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url, bio").or(`username.ilike.${like},display_name.ilike.${like}`).limit(limit),
    supabase.from("posts").select("id, caption, country, cover_url").or(`caption.ilike.${like},country.ilike.${like}`).limit(limit),
    supabase.from("trips").select("id, title, country, city, cover_url").or(`title.ilike.${like},country.ilike.${like},city.ilike.${like}`).limit(limit),
  ]);

  const users: SearchResult[] = (uRes.data ?? []).map((u: any) => ({
    id: u.id,
    kind: "user",
    title: u.display_name || u.username,
    subtitle: `@${u.username}${u.bio ? " · " + u.bio.slice(0, 60) : ""}`,
    image: u.avatar_url ?? undefined,
    to: `/profile/${u.username}`,
    score: best(q, u.username, u.display_name),
  }));

  const posts: SearchResult[] = (pRes.data ?? []).map((p: any) => ({
    id: p.id,
    kind: "post",
    title: p.caption?.slice(0, 80) || "Publication",
    subtitle: p.country ?? undefined,
    image: p.cover_url ?? undefined,
    to: `/post/${p.id}`,
    score: best(q, p.caption, p.country),
  }));

  const trips: SearchResult[] = (tRes.data ?? []).map((t: any) => ({
    id: t.id,
    kind: "trip",
    title: t.title,
    subtitle: [t.city, t.country].filter(Boolean).join(", ") || "Carnet de voyage",
    image: t.cover_url ?? undefined,
    to: `/trips/${t.id}`,
    score: best(q, t.title, t.country, t.city),
  }));

  const dedupe = (arr: SearchResult[]) =>
    arr.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    user: dedupe(users),
    destination: dedupe(destinations),
    activity: dedupe(activities),
    post: dedupe(posts),
    hotel: dedupe(hotels),
    restaurant: dedupe(restaurants),
    trip: dedupe(trips),
    question: dedupe(questions),
  };
}

export const KIND_META: Record<SearchKind, { label: string; emoji: string }> = {
  user: { label: "Voyageurs", emoji: "👤" },
  destination: { label: "Destinations", emoji: "🌍" },
  activity: { label: "Activités", emoji: "🎯" },
  post: { label: "Publications", emoji: "📸" },
  hotel: { label: "Hôtels", emoji: "🏨" },
  restaurant: { label: "Restaurants", emoji: "🍽️" },
  trip: { label: "Carnets", emoji: "📓" },
  question: { label: "Questions", emoji: "💬" },
};
