import { supabase } from "@/integrations/supabase/client";
import { COUNTRIES } from "./countries";
import type { LiveCatalogItem } from "./live-catalog";
import { isTrustedVisibleCatalogItem } from "./catalog-source-routing";
import { slugifyDestination } from "./phase2";

export type SearchKind =
  "user" | "destination" | "activity" | "post" | "hotel" | "restaurant" | "trip" | "question";
export type SearchResult = {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  image?: string;
  catalogItem?: Pick<
    LiveCatalogItem,
    | "id"
    | "kind"
    | "title"
    | "category"
    | "image_url"
    | "tags"
    | "latitude"
    | "longitude"
    | "city"
    | "country"
    | "provider"
    | "external_id"
    | "source_url"
    | "booking_url"
  >;
  to: string;
  score: number;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
function scoreOf(hay: string | null | undefined, q: string) {
  if (!hay) return 0;
  const h = norm(hay);
  const n = norm(q);
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(` ${n}`)) return 60;
  if (h.includes(n)) return 40;
  return 0;
}
function best(q: string, ...fields: Array<string | null | undefined>) {
  return Math.max(0, ...fields.map((f) => scoreOf(f, q)));
}

export async function universalSearch(
  query: string,
  limit = 8,
): Promise<Record<SearchKind, SearchResult[]>> {
  const q = query.trim();
  const empty: Record<SearchKind, SearchResult[]> = {
    user: [],
    destination: [],
    activity: [],
    post: [],
    hotel: [],
    restaurant: [],
    trip: [],
    question: [],
  };
  if (!q) return empty;
  const like = `%${q}%`;

  const [uRes, pRes, tRes, extRes, qRes, dRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, country")
      .or(`username.ilike.${like},display_name.ilike.${like},country.ilike.${like}`)
      .limit(limit * 2),
    supabase
      .from("posts")
      .select("id, caption, country, city, activity, image_url")
      .or(`caption.ilike.${like},country.ilike.${like},city.ilike.${like},activity.ilike.${like}`)
      .limit(limit * 2),
    supabase
      .from("trips")
      .select("id, title, country, city, cover_url")
      .or(`title.ilike.${like},country.ilike.${like},city.ilike.${like}`)
      .limit(limit * 2),
    (supabase as any)
      .from("external_catalog_items")
      .select(
        "id, provider, external_id, title, slug, kind, category, city, country, image_url, source_url, booking_url, tags, latitude, longitude",
      )
      .in("kind", ["activity", "hotel", "restaurant"])
      .eq("published", true)
      .eq("admin_hidden", false)
      .or(`title.ilike.${like},country.ilike.${like},city.ilike.${like},category.ilike.${like}`)
      .limit(limit * 4),
    supabase
      .from("community_questions")
      .select("id, slug, title, country, author_username, votes")
      .or(`title.ilike.${like},country.ilike.${like},author_username.ilike.${like}`)
      .limit(limit * 2),
    supabase
      .from("destinations")
      .select("id, slug, name, city, country, cover_url, summary, popularity")
      .or(`name.ilike.${like},city.ilike.${like},country.ilike.${like}`)
      .limit(limit * 2),
  ]);

  const destinations: SearchResult[] = [
    ...(dRes.data ?? []).map((destination) => ({
      id: destination.id,
      kind: "destination" as const,
      title: destination.name,
      subtitle: [destination.city, destination.country].filter(Boolean).join(", ") || "Destination",
      image: destination.cover_url ?? undefined,
      to: `/destinations/${destination.slug}`,
      score:
        best(q, destination.name, destination.city, destination.country, destination.summary) +
        Math.min(10, Number(destination.popularity ?? 0) / 100),
    })),
    ...COUNTRIES.map((country) => ({
      id: `country-${country}`,
      kind: "destination" as const,
      title: country,
      subtitle: "Pays",
      to: `/destinations/${slugifyDestination(country)}`,
      score: scoreOf(country, q),
    })),
  ].filter((r) => r.score > 0);

  const users: SearchResult[] = (uRes.data ?? []).map((u) => ({
    id: u.id,
    kind: "user",
    title: u.display_name || u.username,
    subtitle: `@${u.username}${u.country ? ` · ${u.country}` : ""}`,
    image: u.avatar_url ?? undefined,
    to: `/profile/${u.username}`,
    score: best(q, u.username, u.display_name, u.country, u.bio),
  }));
  const posts: SearchResult[] = (pRes.data ?? []).map((p) => ({
    id: p.id,
    kind: "post",
    title: p.caption?.slice(0, 80) || "Publication",
    subtitle: [p.city, p.country].filter(Boolean).join(", ") || undefined,
    image: p.image_url,
    to: `/post/${p.id}`,
    score: best(q, p.caption, p.country, p.city, p.activity),
  }));
  const trips: SearchResult[] = (tRes.data ?? []).map((t) => ({
    id: t.id,
    kind: "trip",
    title: t.title,
    subtitle: [t.city, t.country].filter(Boolean).join(", "),
    image: t.cover_url ?? undefined,
    to: `/trips/${t.id}`,
    score: best(q, t.title, t.country, t.city),
  }));
  const questions: SearchResult[] = (qRes.data ?? []).map((item) => ({
    id: item.id,
    kind: "question",
    title: item.title,
    subtitle: `${item.country} · ${item.votes} votes`,
    to: `/questions/${item.slug}`,
    score: best(q, item.title, item.country, item.author_username),
  }));

  const activities: SearchResult[] = [];
  const hotels: SearchResult[] = [];
  const restaurants: SearchResult[] = [];
  for (const item of extRes.data ?? []) {
    const kind = item.kind as "activity" | "hotel" | "restaurant";
    const catalogItem = {
      id: item.id,
      provider: item.provider,
      external_id: item.external_id,
      kind,
      title: item.title,
      category: item.category,
      image_url: item.image_url ?? null,
      tags: item.tags ?? null,
      latitude: item.latitude,
      longitude: item.longitude,
      city: item.city,
      country: item.country,
      source_url: item.source_url,
      booking_url: item.booking_url,
    };
    if (!isTrustedVisibleCatalogItem(catalogItem)) continue;
    const base = {
      id: `external-${item.id}`,
      title: item.title,
      subtitle: [item.city, item.country].filter(Boolean).join(", ") || undefined,
      image: item.image_url ?? undefined,
      catalogItem,
      to: `/activities/${item.slug}`,
      score: best(q, item.title, item.city, item.country, item.category),
    };
    if (kind === "hotel") hotels.push({ ...base, kind });
    else if (kind === "restaurant") restaurants.push({ ...base, kind });
    else activities.push({ ...base, kind: "activity" });
  }

  const clean = (arr: SearchResult[]) =>
    arr
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  return {
    user: clean(users),
    destination: clean(destinations),
    activity: clean(activities),
    post: clean(posts),
    hotel: clean(hotels),
    restaurant: clean(restaurants),
    trip: clean(trips),
    question: clean(questions),
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
