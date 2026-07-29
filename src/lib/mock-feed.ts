// Rich mock posts to bring the feed to life while the real DB grows.
// Shape matches what PostCard consumes so mock and DB posts can be mixed.

export type MockMediaType = "image" | "video" | "reel";
export type MockPost = {
  id: string;
  user_id: string;
  caption: string;
  image_url: string;
  country: string;
  city: string;
  activity?: string | null;
  hashtags: string[];
  created_at: string;
  // Simple lat/lng so we can score "près de toi"
  lat: number;
  lng: number;
  likes: number;
  comment_count: number;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string;
  };
  post_likes: { user_id: string }[];
  comments: { count: number }[];
  post_media: { id: string; url: string; media_type: MockMediaType; position: number }[];
  __mock: true;
};

const av = (seed: string) => `https://i.pravatar.cc/200?u=${seed}`;
const day = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// Vertical (9:16) reel-friendly videos + horizontal videos hosted on Google's public CDN.
const REEL_1 = "https://videos.pexels.com/video-files/2169307/2169307-uhd_1440_2732_30fps.mp4";
const REEL_2 = "https://videos.pexels.com/video-files/4763824/4763824-uhd_1440_2732_25fps.mp4";
const REEL_3 = "https://videos.pexels.com/video-files/3773486/3773486-hd_1080_1920_30fps.mp4";
const REEL_4 = "https://videos.pexels.com/video-files/5788275/5788275-uhd_1440_2732_25fps.mp4";
const VIDEO_H1 = "https://videos.pexels.com/video-files/1093662/1093662-hd_1920_1080_30fps.mp4";
const VIDEO_H2 = "https://videos.pexels.com/video-files/2169880/2169880-hd_1920_1080_30fps.mp4";

const IMG = (id: string, w = 1200, h = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;

const p = (o: {
  id: string; user_id: string; caption: string; country: string; city: string;
  activity?: string; hashtags: string[]; created_at: string;
  lat: number; lng: number; likes: number; comments: number;
  avatar?: string; displayName: string; username: string;
  media: { url: string; media_type: MockMediaType }[];
}): MockPost => ({
  id: o.id,
  user_id: o.user_id,
  caption: o.caption,
  image_url: o.media[0].url,
  country: o.country,
  city: o.city,
  activity: o.activity ?? null,
  hashtags: o.hashtags,
  created_at: o.created_at,
  lat: o.lat,
  lng: o.lng,
  likes: o.likes,
  comment_count: o.comments,
  profiles: {
    username: o.username,
    display_name: o.displayName,
    avatar_url: o.avatar ?? av(o.username),
  },
  post_likes: Array.from({ length: Math.min(o.likes, 3) }, (_, i) => ({ user_id: `mock-liker-${o.id}-${i}` })),
  comments: [{ count: o.comments }],
  post_media: o.media.map((m, i) => ({ id: `${o.id}-m${i}`, url: m.url, media_type: m.media_type, position: i })),
  __mock: true,
});

export const MOCK_POSTS: MockPost[] = [
  p({
    id: "mock-1", user_id: "mock-u-lila", username: "lila.wanders", displayName: "Lila Moreau",
    caption: "Sunrise sur le Machu Picchu — 4h de marche mais qu'est-ce que ça valait le coup 🌄",
    country: "Pérou", city: "Cusco", activity: "Trek", hashtags: ["machupicchu", "sunrise", "hiking", "peru"],
    created_at: day(2), lat: -13.16, lng: -72.54, likes: 1284, comments: 87,
    media: [
      { url: "https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1200&h=1500&q=80", media_type: "image" },
      { url: "https://images.unsplash.com/photo-1587595431973-160d0d94add1?auto=format&fit=crop&w=1200&h=1500&q=80", media_type: "image" },
      { url: "https://images.unsplash.com/photo-1590511723497-1b0b3d1c9c0d?auto=format&fit=crop&w=1200&h=1500&q=80", media_type: "image" },
    ],
  }),
  p({
    id: "mock-2", user_id: "mock-u-kenji", username: "kenji.roams", displayName: "Kenji Tanaka",
    caption: "Ruelles de Gion la nuit — Kyoto est encore plus magique après la pluie.",
    country: "Japon", city: "Kyoto", activity: "Balade", hashtags: ["kyoto", "gion", "japan", "nightwalk"],
    created_at: day(5), lat: 35.00, lng: 135.77, likes: 3421, comments: 214,
    media: [{ url: REEL_1, media_type: "reel" }],
  }),
  p({
    id: "mock-3", user_id: "mock-u-amelie", username: "amelie.paris", displayName: "Amélie Petit",
    caption: "Le petit café secret que je réserve à mes proches 🥐 Address in comments.",
    country: "France", city: "Paris", activity: "Café", hashtags: ["paris", "cafe", "hiddengem"],
    created_at: day(9), lat: 48.86, lng: 2.34, likes: 542, comments: 61,
    media: [
      { url: IMG("1509042239860-f550ce710b93", 1200, 1200), media_type: "image" },
      { url: IMG("1495474472287-4d71bcdd2085", 1200, 1200), media_type: "image" },
    ],
  }),
  p({
    id: "mock-4", user_id: "mock-u-diego", username: "diego.surfs", displayName: "Diego Alvarez",
    caption: "Session parfaite à Uluwatu. La barre était énorme ce matin 🏄‍♂️",
    country: "Indonésie", city: "Bali", activity: "Surf", hashtags: ["bali", "surf", "uluwatu"],
    created_at: day(13), lat: -8.82, lng: 115.09, likes: 2210, comments: 143,
    media: [{ url: REEL_2, media_type: "reel" }],
  }),
  p({
    id: "mock-5", user_id: "mock-u-nora", username: "nora.trails", displayName: "Nora Halvorsen",
    caption: "3 jours sur les fjords de Lofoten. Cabanes rouges, aurores, silence total.",
    country: "Norvège", city: "Reine", activity: "Randonnée", hashtags: ["lofoten", "norway", "auroraborealis"],
    created_at: day(18), lat: 67.93, lng: 13.09, likes: 1876, comments: 92,
    media: [
      { url: IMG("1531366936337-7c912a4589a7", 1200, 1500), media_type: "image" },
      { url: IMG("1520769945061-0a448c463865", 1200, 1500), media_type: "image" },
      { url: IMG("1519681393784-d120267933ba", 1200, 1500), media_type: "image" },
      { url: IMG("1483728642387-6c3bdd6c93e5", 1200, 1500), media_type: "image" },
    ],
  }),
  p({
    id: "mock-6", user_id: "mock-u-sofia", username: "sofia.souks", displayName: "Sofia El Amrani",
    caption: "Perdue avec plaisir dans les souks de Marrakech. Chaque ruelle est un tableau.",
    country: "Maroc", city: "Marrakech", activity: "Shopping", hashtags: ["marrakech", "souks", "morocco"],
    created_at: day(24), lat: 31.63, lng: -7.99, likes: 987, comments: 44,
    media: [{ url: VIDEO_H1, media_type: "video" }],
  }),
  p({
    id: "mock-7", user_id: "mock-u-marco", username: "marco.rides", displayName: "Marco Bianchi",
    caption: "Route des vins en Toscane. On roule doucement, on s'arrête souvent 🍷",
    country: "Italie", city: "Val d'Orcia", activity: "Road trip", hashtags: ["tuscany", "italy", "roadtrip", "wine"],
    created_at: day(30), lat: 43.06, lng: 11.61, likes: 1445, comments: 78,
    media: [
      { url: IMG("1533105079780-92b9be482077", 1200, 900), media_type: "image" },
      { url: IMG("1523906834658-6e24ef2386f9", 1200, 900), media_type: "image" },
    ],
  }),
  p({
    id: "mock-8", user_id: "mock-u-yuki", username: "yuki.eats", displayName: "Yuki Sato",
    caption: "Petit-dej ramen à 6h du mat' avant le train pour Osaka 🍜",
    country: "Japon", city: "Tokyo", activity: "Food", hashtags: ["tokyo", "ramen", "japan", "foodie"],
    created_at: day(36), lat: 35.68, lng: 139.69, likes: 3120, comments: 201,
    media: [{ url: REEL_3, media_type: "reel" }],
  }),
  p({
    id: "mock-9", user_id: "mock-u-aisha", username: "aisha.dunes", displayName: "Aisha Khan",
    caption: "Nuit sous les étoiles dans le désert de Wadi Rum. Zéro pollution lumineuse.",
    country: "Jordanie", city: "Wadi Rum", activity: "Camping", hashtags: ["wadirum", "jordan", "desert", "stars"],
    created_at: day(42), lat: 29.53, lng: 35.42, likes: 2087, comments: 118,
    media: [
      { url: IMG("1534447677768-be436bb09401", 1200, 1500), media_type: "image" },
      { url: IMG("1547471080-7cc2caa01a7e", 1200, 1500), media_type: "image" },
    ],
  }),
  p({
    id: "mock-10", user_id: "mock-u-lucas", username: "lucas.snow", displayName: "Lucas Dubois",
    caption: "Première descente hors-piste de la saison à Chamonix ⛷️ Powder day parfait.",
    country: "France", city: "Chamonix", activity: "Ski", hashtags: ["chamonix", "ski", "alps", "powder"],
    created_at: day(50), lat: 45.92, lng: 6.87, likes: 1673, comments: 89,
    media: [{ url: REEL_4, media_type: "reel" }],
  }),
  p({
    id: "mock-11", user_id: "mock-u-emma", username: "emma.reef", displayName: "Emma Wilson",
    caption: "La Grande Barrière de Corail — bien plus vivante que ce qu'on entend aux infos.",
    country: "Australie", city: "Cairns", activity: "Plongée", hashtags: ["greatbarrierreef", "australia", "diving"],
    created_at: day(60), lat: -16.92, lng: 145.77, likes: 2543, comments: 156,
    media: [
      { url: IMG("1583212292454-1fe6229603b7", 1200, 1200), media_type: "image" },
      { url: IMG("1544551763-46a013bb70d5", 1200, 1200), media_type: "image" },
      { url: VIDEO_H2, media_type: "video" },
    ],
  }),
  p({
    id: "mock-12", user_id: "mock-u-thomas", username: "thomas.bikes", displayName: "Thomas Berger",
    caption: "Berlin à vélo en une journée. 8 quartiers, 3 currywursts, 0 regret.",
    country: "Allemagne", city: "Berlin", activity: "Vélo", hashtags: ["berlin", "germany", "cycling"],
    created_at: day(72), lat: 52.52, lng: 13.40, likes: 743, comments: 38,
    media: [{ url: IMG("1587330979470-3595ac045ab0", 1200, 1200), media_type: "image" }],
  }),
];

// Haversine distance in km
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type FeedTab = "foryou" | "following" | "nearby";

export function rankMockPosts(tab: FeedTab, opts: {
  followingUsernames?: Set<string>;
  userLocation?: { lat: number; lng: number } | null;
  interests?: Set<string>; // hashtags or countries
}): MockPost[] {
  const { followingUsernames, userLocation, interests } = opts;
  const now = Date.now();
  const scored = MOCK_POSTS.map((post) => {
    const ageH = (now - new Date(post.created_at).getTime()) / 3600_000;
    const recency = Math.max(0, 100 - ageH * 0.8);
    const popularity = Math.log10(post.likes + 10) * 40 + post.comment_count * 0.3;
    const followed = followingUsernames?.has(post.profiles.username) ? 200 : 0;
    const interestBoost = interests
      ? (post.hashtags.some((h) => interests.has(h)) ? 80 : 0) + (interests.has(post.country) ? 60 : 0)
      : 0;
    const dist = userLocation ? distanceKm(userLocation, { lat: post.lat, lng: post.lng }) : Infinity;
    const proximity = userLocation ? Math.max(0, 200 - dist / 50) : 0;

    let score = 0;
    if (tab === "foryou") score = recency + popularity + followed + interestBoost + proximity * 0.5;
    else if (tab === "following") score = followed + recency * 0.5;
    else score = proximity + recency * 0.3;
    return { post, score };
  });

  const filtered = scored.filter(({ post, score }) => {
    if (tab === "following") return followingUsernames?.has(post.profiles.username);
    if (tab === "nearby") {
      if (!userLocation) return false;
      const dist = distanceKm(userLocation, { lat: post.lat, lng: post.lng });
      return dist <= 2000;
    }
    return true;
  });

  return filtered.sort((a, b) => b.score - a.score).map((x) => x.post);
}
