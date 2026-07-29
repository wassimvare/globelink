// Fictional travellers shown on the world map as an ambient layer
export type MapTraveler = {
  id: string;
  name: string;
  avatar: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  starts_on: string;
  ends_on: string;
  budget_eur: number;
  languages: string[];
  interests: string[];
  bio: string;
};

const A = (n: number) => `https://i.pravatar.cc/160?img=${n}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const soon = (days: number, len: number) => {
  const s = new Date();
  s.setDate(s.getDate() + days);
  const e = new Date(s);
  e.setDate(e.getDate() + len);
  return [iso(s), iso(e)] as const;
};

export const MOCK_TRAVELERS: MapTraveler[] = [
  { id: "t1", name: "Léa Moreau", avatar: A(47), lat: -8.4095, lng: 115.1889, city: "Ubud", country: "Indonésie",
    ...(() => { const [s, e] = soon(12, 14); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 1200, languages: ["Français", "Anglais"], interests: ["Plongée", "Yoga", "Photo"],
    bio: "Slow travel entre rizières et récifs. Solo, ouverte aux rencontres." },
  { id: "t2", name: "Julien P.", avatar: A(12), lat: 13.7563, lng: 100.5018, city: "Bangkok", country: "Thaïlande",
    ...(() => { const [s, e] = soon(20, 10); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 900, languages: ["Français", "Anglais"], interests: ["Street food", "Randonnée"],
    bio: "Backpack + carnet de croquis. On mange partout." },
  { id: "t3", name: "Amélie R.", avatar: A(32), lat: 35.6762, lng: 139.6503, city: "Tokyo", country: "Japon",
    ...(() => { const [s, e] = soon(45, 12); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 2500, languages: ["Français", "Anglais", "Japonais"], interests: ["Musées", "Café", "Design"],
    bio: "Trip design & jazz bars. Cherche co-explorer pour Kyoto." },
  { id: "t4", name: "Karim S.", avatar: A(15), lat: 31.6295, lng: -7.9811, city: "Marrakech", country: "Maroc",
    ...(() => { const [s, e] = soon(9, 7); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 600, languages: ["Français", "Arabe"], interests: ["Souks", "Désert", "Photo"],
    bio: "Bivouac Merzouga puis Atlas. Groupe 2-4." },
  { id: "t5", name: "Chloé D.", avatar: A(48), lat: -13.5320, lng: -71.9675, city: "Cusco", country: "Pérou",
    ...(() => { const [s, e] = soon(30, 18); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 1800, languages: ["Français", "Espagnol"], interests: ["Randonnée", "Culture", "Trek"],
    bio: "Salkantay puis Amazonie. Rythme lent, hostel life." },
  { id: "t6", name: "Marco V.", avatar: A(56), lat: 41.9028, lng: 12.4964, city: "Rome", country: "Italie",
    ...(() => { const [s, e] = soon(6, 5); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 700, languages: ["Français", "Italien", "Anglais"], interests: ["Vie nocturne", "Art"],
    bio: "Week-end prolongé, foodie curieux." },
  { id: "t7", name: "Sophia L.", avatar: A(21), lat: 25.0330, lng: 121.5654, city: "Taipei", country: "Chine",
    ...(() => { const [s, e] = soon(60, 21); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 2100, languages: ["Français", "Anglais", "Mandarin"], interests: ["Street food", "Randonnée", "Café"],
    bio: "Tour de l'île à vélo. Cherche compagnon.e de route." },
  { id: "t8", name: "Théo B.", avatar: A(60), lat: -3.4653, lng: -62.2159, city: "Manaus", country: "Brésil",
    ...(() => { const [s, e] = soon(80, 25); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 3000, languages: ["Français", "Portugais"], interests: ["Aventure", "Nature", "Photo"],
    bio: "Expédition Amazone, place pour 2." },
  { id: "t9", name: "Nina K.", avatar: A(9), lat: 64.1466, lng: -21.9426, city: "Reykjavik", country: "Islande",
    ...(() => { const [s, e] = soon(18, 8); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 1600, languages: ["Français", "Anglais"], interests: ["Randonnée", "Photo", "Aurores"],
    bio: "Ring Road en van, chasse aux aurores." },
  { id: "t10", name: "Antoine G.", avatar: A(3), lat: -33.9249, lng: 18.4241, city: "Le Cap", country: "Afrique du Sud",
    ...(() => { const [s, e] = soon(25, 14); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 1400, languages: ["Français", "Anglais"], interests: ["Surf", "Randonnée", "Vin"],
    bio: "Garden Route et surf trip." },
  { id: "t11", name: "Camille V.", avatar: A(45), lat: 21.0285, lng: 105.8542, city: "Hanoï", country: "Vietnam",
    ...(() => { const [s, e] = soon(15, 20); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 1100, languages: ["Français", "Anglais"], interests: ["Trek", "Culture", "Café"],
    bio: "Nord Vietnam en scooter." },
  { id: "t12", name: "Yasmine B.", avatar: A(24), lat: 36.8065, lng: 10.1815, city: "Tunis", country: "Tunisie",
    ...(() => { const [s, e] = soon(4, 6); return { starts_on: s, ends_on: e }; })(),
    budget_eur: 500, languages: ["Français", "Arabe"], interests: ["Plage", "Culture"],
    bio: "Escapade Sidi Bou Saïd + Kairouan." },
];
