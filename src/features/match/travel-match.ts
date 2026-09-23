export type MapTraveler = {
  id: string;
  name: string;
  avatar: string | null;
  lat: number;
  lng: number;
  city: string;
  country: string;
  starts_on: string;
  ends_on: string;
  budget_eur: number | null;
  languages: string[];
  interests: string[];
  bio: string;
  age: number | null;
};

export type MyPrefs = {
  destination: string;
  budget: number;
  languages: string[];
  interests: string[];
  ageMin: number;
  ageMax: number;
  startsOn: string;
  endsOn: string;
};

export type ScorePart = {
  label: "Destination" | "Dates" | "Budget" | "Langues" | "Affinités" | "Âge";
  got: number;
  max: number;
};

export type MatchIntent = {
  id: "activity" | "coffee" | "explore";
  label: string;
  helper: string;
  draft: string;
};

export const DEFAULT_PREFS: MyPrefs = {
  destination: "",
  budget: 0,
  languages: [],
  interests: [],
  ageMin: 18,
  ageMax: 99,
  startsOn: "",
  endsOn: "",
};

export const ALL_LANGS = [
  "Français",
  "Anglais",
  "Espagnol",
  "Italien",
  "Portugais",
  "Arabe",
  "Japonais",
  "Mandarin",
];

export const ALL_INTERESTS = [
  "Plage",
  "Randonnée",
  "Plongée",
  "Surf",
  "Yoga",
  "Culture",
  "Musées",
  "Street food",
  "Vie nocturne",
  "Photo",
  "Aventure",
  "Nature",
  "Trek",
  "Café",
  "Vin",
  "Design",
];

export function isValidMatchDate(value: string) {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function daysOverlap(aS: string, aE: string, bS: string, bE: string) {
  if (![aS, aE, bS, bE].every(isValidMatchDate)) return 0;
  const s = Math.max(Date.parse(aS), Date.parse(bS));
  const e = Math.min(Date.parse(aE), Date.parse(bE));
  return Math.max(0, Math.floor((e - s) / 86_400_000) + 1);
}

function normalizeMatchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function destinationMatches(t: MapTraveler, destination: string) {
  const wanted = normalizeMatchText(destination)
    .split(/[,/|–—-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (wanted.length === 0) return false;
  const candidate = normalizeMatchText(`${t.city} ${t.country}`);
  return wanted.some((part) => candidate.includes(part));
}

export function scoreTraveler(t: MapTraveler, p: MyPrefs) {
  const parts: ScorePart[] = [];

  const hasDestination =
    p.destination.trim().length > 0 &&
    (t.city.trim().length > 0 || t.country.trim().length > 0);
  parts.push({
    label: "Destination",
    got: hasDestination && destinationMatches(t, p.destination) ? 30 : 0,
    max: hasDestination ? 30 : 0,
  });

  const hasDates = [p.startsOn, p.endsOn, t.starts_on, t.ends_on].every(isValidMatchDate);
  const overlap = hasDates ? daysOverlap(p.startsOn, p.endsOn, t.starts_on, t.ends_on) : 0;
  const datePts = hasDates && overlap > 0 ? Math.min(20, 5 + overlap * 2) : 0;
  parts.push({ label: "Dates", got: datePts, max: hasDates ? 20 : 0 });

  const hasBudget = t.budget_eur !== null && t.budget_eur > 0 && p.budget > 0;
  const ratio = hasBudget
    ? Math.abs(p.budget - t.budget_eur!) / Math.max(p.budget, t.budget_eur!)
    : null;
  const budgetPts =
    ratio === null ? 0 : ratio < 0.15 ? 15 : ratio < 0.35 ? 10 : ratio < 0.6 ? 5 : 0;
  parts.push({ label: "Budget", got: budgetPts, max: hasBudget ? 15 : 0 });

  const sharedLangs = t.languages.filter((language) => p.languages.includes(language));
  const hasLanguages = t.languages.length > 0 && p.languages.length > 0;
  parts.push({
    label: "Langues",
    got: hasLanguages ? Math.min(10, sharedLangs.length * 5) : 0,
    max: hasLanguages ? 10 : 0,
  });

  const sharedInts = t.interests.filter((interest) => p.interests.includes(interest));
  const hasInterests = t.interests.length > 0 && p.interests.length > 0;
  const unionSize = new Set([...t.interests, ...p.interests]).size;
  const affinityRatio = unionSize > 0 ? sharedInts.length / unionSize : 0;
  const affinityPts = hasInterests
    ? Math.min(15, Math.round(affinityRatio * 10 + Math.min(sharedInts.length, 5)))
    : 0;
  parts.push({ label: "Affinités", got: affinityPts, max: hasInterests ? 15 : 0 });

  const age = t.age;
  const hasAge = age !== null;
  const agePts = hasAge && age >= p.ageMin && age <= p.ageMax ? 10 : 0;
  parts.push({ label: "Âge", got: agePts, max: hasAge ? 10 : 0 });

  const knownMax = parts.reduce((total, part) => total + part.max, 0);
  const knownPoints = parts.reduce((total, part) => total + part.got, 0);
  const score = knownMax > 0 ? Math.round((knownPoints / knownMax) * 100) : 0;

  return { score, parts, sharedLangs, sharedInts, overlap, age };
}

export function matchQuality(score: number, parts: ScorePart[]) {
  const travelParts = parts.filter((part) => ["Destination", "Dates"].includes(part.label));
  const missingTravelContext = travelParts.some((part) => part.max === 0);
  const incompatibleTravel = travelParts.some((part) => part.max > 0 && part.got === 0);

  if (incompatibleTravel) return "Voyage différent";
  if (missingTravelContext) return score >= 70 ? "Affinités fortes" : "Voyage à confirmer";
  if (score >= 85) return "Excellent match";
  if (score >= 70) return "Très compatible";
  if (score >= 55) return "Bon potentiel";
  return "À découvrir";
}

export function compatibilitySignals(input: {
  overlap: number;
  sharedInts: string[];
  sharedLangs: string[];
}) {
  const { overlap, sharedInts, sharedLangs } = input;
  return [
    overlap > 0
      ? `${overlap} jour${overlap > 1 ? "s" : ""} de voyage en commun`
      : null,
    sharedInts.length
      ? `${sharedInts.length} centre${sharedInts.length > 1 ? "s" : ""} d’intérêt commun${sharedInts.length > 1 ? "s" : ""}`
      : null,
    sharedLangs.length
      ? `${sharedLangs.length} langue${sharedLangs.length > 1 ? "s" : ""} commune${sharedLangs.length > 1 ? "s" : ""}`
      : null,
  ].filter(Boolean) as string[];
}

export function suggestedMeetups(t: MapTraveler, sharedInts: string[]): MatchIntent[] {
  const place = [t.city, t.country].filter(Boolean).join(", ") || "votre destination";
  const shared = sharedInts[0];

  return [
    {
      id: "activity",
      label: "Faire une activité ensemble",
      helper: shared ? `Vous aimez tous les deux : ${shared}` : "Choisir une activité sur place",
      draft: shared
        ? `Salut ${t.name} 👋 On a ${shared} en commun. Ça te dirait de faire une activité ensemble autour de ça à ${place} ?`
        : `Salut ${t.name} 👋 Ça te dirait qu’on fasse une activité ensemble à ${place} pendant nos dates en commun ?`,
    },
    {
      id: "coffee",
      label: "Prendre un café",
      helper: "Un premier contact simple",
      draft: `Salut ${t.name} 👋 On sera à ${place} au même moment. Ça te dirait de prendre un café et d’échanger sur nos plans ?`,
    },
    {
      id: "explore",
      label: "Explorer ensemble",
      helper: "Partager une demi-journée ou une journée",
      draft: `Salut ${t.name} 👋 Nos voyages se croisent à ${place}. Ça te dirait d’explorer un coin ensemble pendant une demi-journée ou une journée ?`,
    },
  ];
}
