// Gamification model: levels, badges, and derivation from stats.

export type Level = {
  key: "debutant" | "explorateur" | "aventurier" | "globe_trotter" | "legende";
  label: string;
  emoji: string;
  minXp: number;
  gradient: string;
};

export const LEVELS: Level[] = [
  { key: "debutant",      label: "Débutant",      emoji: "🌱", minXp: 0,     gradient: "from-emerald-400 to-teal-500" },
  { key: "explorateur",   label: "Explorateur",   emoji: "🧭", minXp: 500,   gradient: "from-sky-400 to-indigo-500" },
  { key: "aventurier",    label: "Aventurier",    emoji: "🎒", minXp: 2000,  gradient: "from-fuchsia-400 to-purple-500" },
  { key: "globe_trotter", label: "Globe Trotter", emoji: "🌍", minXp: 6000,  gradient: "from-amber-400 to-orange-500" },
  { key: "legende",       label: "Légende",       emoji: "👑", minXp: 15000, gradient: "from-yellow-300 to-rose-500" },
];

export type UserStats = {
  countries: number;
  posts: number;
  likes: number;
  distanceKm: number;
  trips: number;
  reels: number;
};

// XP recipe — balanced so a real explorer easily reaches Aventurier.
export function computeXp(s: UserStats) {
  return Math.round(
    s.countries * 120 +
    s.posts * 15 +
    s.likes * 2 +
    s.distanceKm * 0.5 +
    s.trips * 250 +
    s.reels * 60,
  );
}

export function getLevel(xp: number) {
  let current = LEVELS[0];
  let next: Level | null = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) current = LEVELS[i];
    if (LEVELS[i].minXp > xp) { next = LEVELS[i]; break; }
  }
  const from = current.minXp;
  const to = next?.minXp ?? current.minXp + 1;
  const progress = next ? Math.min(1, (xp - from) / (to - from)) : 1;
  return { current, next, progress, xp };
}

export type BadgeDef = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  target: number;
  metric: keyof UserStats;
};

export const BADGES: BadgeDef[] = [
  { key: "first_trip",     label: "Premier voyage",     description: "Créer ton tout premier carnet",  emoji: "🧳", target: 1,     metric: "trips" },
  { key: "five_countries", label: "5 pays",             description: "Explorer 5 pays différents",     emoji: "🗺️", target: 5,     metric: "countries" },
  { key: "ten_countries",  label: "10 pays",            description: "Explorer 10 pays différents",    emoji: "🌐", target: 10,    metric: "countries" },
  { key: "hundred_posts",  label: "100 publications",   description: "Publier 100 posts",              emoji: "📸", target: 100,   metric: "posts" },
  { key: "thousand_likes", label: "1 000 likes",        description: "Cumuler 1 000 likes",            emoji: "❤️", target: 1000,  metric: "likes" },
  { key: "hundred_km",     label: "100 km parcourus",   description: "Cumuler 100 km sur tes carnets", emoji: "🛤️", target: 100,   metric: "distanceKm" },
  { key: "tenk_km",        label: "10 000 km parcourus",description: "Cumuler 10 000 km",              emoji: "✈️", target: 10000, metric: "distanceKm" },
  { key: "first_journal",  label: "Premier carnet",     description: "Ouvrir ton premier carnet",      emoji: "📓", target: 1,     metric: "trips" },
  { key: "first_reel",     label: "Premier Reel",       description: "Publier ton premier Reel",       emoji: "🎬", target: 1,     metric: "reels" },
];

export function evaluateBadges(stats: UserStats) {
  return BADGES.map((b) => {
    const value = stats[b.metric] ?? 0;
    const progress = Math.min(1, value / b.target);
    return { ...b, value, progress, unlocked: value >= b.target };
  });
}
