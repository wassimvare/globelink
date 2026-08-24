export type WorldMapHub = {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  zoom?: number;
};

// Instant worldwide discovery layer.
// These are navigation anchors, not fabricated POI counts: clicking a hub zooms
// to the city and lets the live viewport loader fetch the real places there.
export const WORLD_MAP_HUBS: WorldMapHub[] = [
  // North America
  { id: "vancouver", city: "Vancouver", country: "Canada", lat: 49.2827, lng: -123.1207 },
  { id: "seattle", city: "Seattle", country: "États-Unis", lat: 47.6062, lng: -122.3321 },
  {
    id: "san-francisco",
    city: "San Francisco",
    country: "États-Unis",
    lat: 37.7749,
    lng: -122.4194,
  },
  { id: "los-angeles", city: "Los Angeles", country: "États-Unis", lat: 34.0522, lng: -118.2437 },
  { id: "san-diego", city: "San Diego", country: "États-Unis", lat: 32.7157, lng: -117.1611 },
  { id: "las-vegas", city: "Las Vegas", country: "États-Unis", lat: 36.1699, lng: -115.1398 },
  { id: "denver", city: "Denver", country: "États-Unis", lat: 39.7392, lng: -104.9903 },
  { id: "dallas", city: "Dallas", country: "États-Unis", lat: 32.7767, lng: -96.797 },
  { id: "houston", city: "Houston", country: "États-Unis", lat: 29.7604, lng: -95.3698 },
  { id: "chicago", city: "Chicago", country: "États-Unis", lat: 41.8781, lng: -87.6298 },
  { id: "toronto", city: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { id: "montreal", city: "Montréal", country: "Canada", lat: 45.5019, lng: -73.5674 },
  { id: "boston", city: "Boston", country: "États-Unis", lat: 42.3601, lng: -71.0589 },
  { id: "new-york", city: "New York", country: "États-Unis", lat: 40.7128, lng: -74.006 },
  { id: "washington", city: "Washington", country: "États-Unis", lat: 38.9072, lng: -77.0369 },
  { id: "miami", city: "Miami", country: "États-Unis", lat: 25.7617, lng: -80.1918 },
  { id: "mexico-city", city: "Mexico", country: "Mexique", lat: 19.4326, lng: -99.1332 },
  { id: "cancun", city: "Cancún", country: "Mexique", lat: 21.1619, lng: -86.8515 },
  { id: "havana", city: "La Havane", country: "Cuba", lat: 23.1136, lng: -82.3666 },
  { id: "san-juan", city: "San Juan", country: "Porto Rico", lat: 18.4655, lng: -66.1057 },
  { id: "panama", city: "Panama", country: "Panama", lat: 8.9824, lng: -79.5199 },
  { id: "san-jose-cr", city: "San José", country: "Costa Rica", lat: 9.9281, lng: -84.0907 },

  // South America
  { id: "bogota", city: "Bogotá", country: "Colombie", lat: 4.711, lng: -74.0721 },
  { id: "medellin", city: "Medellín", country: "Colombie", lat: 6.2442, lng: -75.5812 },
  { id: "quito", city: "Quito", country: "Équateur", lat: -0.1807, lng: -78.4678 },
  { id: "lima", city: "Lima", country: "Pérou", lat: -12.0464, lng: -77.0428 },
  { id: "la-paz", city: "La Paz", country: "Bolivie", lat: -16.4897, lng: -68.1193 },
  { id: "santiago", city: "Santiago", country: "Chili", lat: -33.4489, lng: -70.6693 },
  { id: "buenos-aires", city: "Buenos Aires", country: "Argentine", lat: -34.6037, lng: -58.3816 },
  { id: "montevideo", city: "Montevideo", country: "Uruguay", lat: -34.9011, lng: -56.1645 },
  { id: "sao-paulo", city: "São Paulo", country: "Brésil", lat: -23.5505, lng: -46.6333 },
  { id: "rio", city: "Rio de Janeiro", country: "Brésil", lat: -22.9068, lng: -43.1729 },
  { id: "brasilia", city: "Brasília", country: "Brésil", lat: -15.7939, lng: -47.8828 },
  { id: "salvador", city: "Salvador", country: "Brésil", lat: -12.9777, lng: -38.5016 },

  // Europe
  { id: "reykjavik", city: "Reykjavík", country: "Islande", lat: 64.1466, lng: -21.9426 },
  { id: "dublin", city: "Dublin", country: "Irlande", lat: 53.3498, lng: -6.2603 },
  { id: "london", city: "Londres", country: "Royaume-Uni", lat: 51.5072, lng: -0.1276 },
  { id: "lisbon", city: "Lisbonne", country: "Portugal", lat: 38.7223, lng: -9.1393 },
  { id: "madrid", city: "Madrid", country: "Espagne", lat: 40.4168, lng: -3.7038 },
  { id: "barcelona", city: "Barcelone", country: "Espagne", lat: 41.3874, lng: 2.1686 },
  { id: "paris", city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { id: "lyon", city: "Lyon", country: "France", lat: 45.764, lng: 4.8357 },
  { id: "geneva", city: "Genève", country: "Suisse", lat: 46.2044, lng: 6.1432 },
  { id: "zurich", city: "Zurich", country: "Suisse", lat: 47.3769, lng: 8.5417 },
  { id: "brussels", city: "Bruxelles", country: "Belgique", lat: 50.8503, lng: 4.3517 },
  { id: "amsterdam", city: "Amsterdam", country: "Pays-Bas", lat: 52.3676, lng: 4.9041 },
  { id: "berlin", city: "Berlin", country: "Allemagne", lat: 52.52, lng: 13.405 },
  { id: "copenhagen", city: "Copenhague", country: "Danemark", lat: 55.6761, lng: 12.5683 },
  { id: "oslo", city: "Oslo", country: "Norvège", lat: 59.9139, lng: 10.7522 },
  { id: "stockholm", city: "Stockholm", country: "Suède", lat: 59.3293, lng: 18.0686 },
  { id: "helsinki", city: "Helsinki", country: "Finlande", lat: 60.1699, lng: 24.9384 },
  { id: "warsaw", city: "Varsovie", country: "Pologne", lat: 52.2297, lng: 21.0122 },
  { id: "prague", city: "Prague", country: "Tchéquie", lat: 50.0755, lng: 14.4378 },
  { id: "vienna", city: "Vienne", country: "Autriche", lat: 48.2082, lng: 16.3738 },
  { id: "budapest", city: "Budapest", country: "Hongrie", lat: 47.4979, lng: 19.0402 },
  { id: "bucharest", city: "Bucarest", country: "Roumanie", lat: 44.4268, lng: 26.1025 },
  { id: "milan", city: "Milan", country: "Italie", lat: 45.4642, lng: 9.19 },
  { id: "rome", city: "Rome", country: "Italie", lat: 41.9028, lng: 12.4964 },
  { id: "athens", city: "Athènes", country: "Grèce", lat: 37.9838, lng: 23.7275 },
  { id: "istanbul", city: "Istanbul", country: "Turquie", lat: 41.0082, lng: 28.9784 },

  // Africa
  { id: "casablanca", city: "Casablanca", country: "Maroc", lat: 33.5731, lng: -7.5898 },
  { id: "marrakech", city: "Marrakech", country: "Maroc", lat: 31.6295, lng: -7.9811 },
  { id: "tunis", city: "Tunis", country: "Tunisie", lat: 36.8065, lng: 10.1815 },
  { id: "cairo", city: "Le Caire", country: "Égypte", lat: 30.0444, lng: 31.2357 },
  { id: "dakar", city: "Dakar", country: "Sénégal", lat: 14.7167, lng: -17.4677 },
  { id: "accra", city: "Accra", country: "Ghana", lat: 5.6037, lng: -0.187 },
  { id: "lagos", city: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
  { id: "addis-ababa", city: "Addis-Abeba", country: "Éthiopie", lat: 8.9806, lng: 38.7578 },
  { id: "nairobi", city: "Nairobi", country: "Kenya", lat: -1.2864, lng: 36.8172 },
  { id: "zanzibar", city: "Zanzibar", country: "Tanzanie", lat: -6.1659, lng: 39.2026 },
  {
    id: "johannesburg",
    city: "Johannesburg",
    country: "Afrique du Sud",
    lat: -26.2041,
    lng: 28.0473,
  },
  { id: "cape-town", city: "Cape Town", country: "Afrique du Sud", lat: -33.9249, lng: 18.4241 },

  // Middle East
  { id: "dubai", city: "Dubaï", country: "Émirats arabes unis", lat: 25.2048, lng: 55.2708 },
  {
    id: "abu-dhabi",
    city: "Abu Dhabi",
    country: "Émirats arabes unis",
    lat: 24.4539,
    lng: 54.3773,
  },
  { id: "doha", city: "Doha", country: "Qatar", lat: 25.2854, lng: 51.531 },
  { id: "riyadh", city: "Riyad", country: "Arabie saoudite", lat: 24.7136, lng: 46.6753 },
  { id: "amman", city: "Amman", country: "Jordanie", lat: 31.9539, lng: 35.9106 },
  { id: "muscat", city: "Mascate", country: "Oman", lat: 23.588, lng: 58.3829 },

  // Asia
  { id: "delhi", city: "Delhi", country: "Inde", lat: 28.6139, lng: 77.209 },
  { id: "mumbai", city: "Mumbai", country: "Inde", lat: 19.076, lng: 72.8777 },
  { id: "kathmandu", city: "Katmandou", country: "Népal", lat: 27.7172, lng: 85.324 },
  { id: "colombo", city: "Colombo", country: "Sri Lanka", lat: 6.9271, lng: 79.8612 },
  { id: "bangkok", city: "Bangkok", country: "Thaïlande", lat: 13.7563, lng: 100.5018 },
  { id: "chiang-mai", city: "Chiang Mai", country: "Thaïlande", lat: 18.7883, lng: 98.9853 },
  { id: "hanoi", city: "Hanoï", country: "Vietnam", lat: 21.0278, lng: 105.8342 },
  { id: "ho-chi-minh", city: "Hô Chi Minh-Ville", country: "Vietnam", lat: 10.8231, lng: 106.6297 },
  { id: "phnom-penh", city: "Phnom Penh", country: "Cambodge", lat: 11.5564, lng: 104.9282 },
  { id: "kuala-lumpur", city: "Kuala Lumpur", country: "Malaisie", lat: 3.139, lng: 101.6869 },
  { id: "singapore", city: "Singapour", country: "Singapour", lat: 1.3521, lng: 103.8198 },
  { id: "jakarta", city: "Jakarta", country: "Indonésie", lat: -6.2088, lng: 106.8456 },
  { id: "bali", city: "Bali", country: "Indonésie", lat: -8.4095, lng: 115.1889, zoom: 9 },
  { id: "manila", city: "Manille", country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { id: "hong-kong", city: "Hong Kong", country: "Hong Kong", lat: 22.3193, lng: 114.1694 },
  { id: "taipei", city: "Taipei", country: "Taïwan", lat: 25.033, lng: 121.5654 },
  { id: "shanghai", city: "Shanghai", country: "Chine", lat: 31.2304, lng: 121.4737 },
  { id: "beijing", city: "Pékin", country: "Chine", lat: 39.9042, lng: 116.4074 },
  { id: "seoul", city: "Séoul", country: "Corée du Sud", lat: 37.5665, lng: 126.978 },
  { id: "tokyo", city: "Tokyo", country: "Japon", lat: 35.6762, lng: 139.6503 },
  { id: "osaka", city: "Osaka", country: "Japon", lat: 34.6937, lng: 135.5023 },

  // Oceania / Pacific
  { id: "perth", city: "Perth", country: "Australie", lat: -31.9505, lng: 115.8605 },
  { id: "adelaide", city: "Adélaïde", country: "Australie", lat: -34.9285, lng: 138.6007 },
  { id: "melbourne", city: "Melbourne", country: "Australie", lat: -37.8136, lng: 144.9631 },
  { id: "sydney", city: "Sydney", country: "Australie", lat: -33.8688, lng: 151.2093 },
  { id: "brisbane", city: "Brisbane", country: "Australie", lat: -27.4698, lng: 153.0251 },
  { id: "auckland", city: "Auckland", country: "Nouvelle-Zélande", lat: -36.8509, lng: 174.7645 },
  {
    id: "queenstown",
    city: "Queenstown",
    country: "Nouvelle-Zélande",
    lat: -45.0312,
    lng: 168.6626,
  },
  { id: "honolulu", city: "Honolulu", country: "États-Unis", lat: 21.3069, lng: -157.8583 },
];
