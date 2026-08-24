export type SmartMatchTraveler = {
  city: string;
  country: string;
  startsOn: string;
  endsOn: string;
  budgetEur: number | null;
  languages: string[];
  interests: string[];
  age: number | null;
};

export type SmartMatchPreferences = {
  destination: string;
  startsOn: string;
  endsOn: string;
  budgetEur: number | null;
  languages: string[];
  interests: string[];
  ageMin: number;
  ageMax: number;
};

export type SmartMatchScore = {
  score: number;
  reasons: string[];
  sharedLanguages: string[];
  sharedInterests: string[];
  overlapDays: number;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = Date.parse(aStart);
  const aE = Date.parse(aEnd);
  const bS = Date.parse(bStart);
  const bE = Date.parse(bEnd);
  if (![aS, aE, bS, bE].every(Number.isFinite)) return 0;
  const start = Math.max(aS, bS);
  const end = Math.min(aE, bE);
  return Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
}

export function calculatePhase3Compatibility(
  traveler: SmartMatchTraveler,
  prefs: SmartMatchPreferences,
): SmartMatchScore {
  let score = 0;
  const reasons: string[] = [];

  const requestedDestination = normalize(prefs.destination);
  const travelerDestination = normalize(`${traveler.city} ${traveler.country}`);
  if (!requestedDestination) {
    score += 20;
  } else if (
    travelerDestination.includes(requestedDestination) ||
    requestedDestination.includes(normalize(traveler.city)) ||
    requestedDestination.includes(normalize(traveler.country))
  ) {
    score += 30;
    reasons.push(`Même destination : ${[traveler.city, traveler.country].filter(Boolean).join(", ")}`);
  }

  const overlap = overlapDays(prefs.startsOn, prefs.endsOn, traveler.startsOn, traveler.endsOn);
  if (overlap > 0) {
    score += Math.min(20, 6 + overlap * 2);
    reasons.push(`${overlap} jour${overlap > 1 ? "s" : ""} de voyage en commun`);
  }

  const sharedInterests = traveler.interests.filter((interest) =>
    prefs.interests.some((candidate) => normalize(candidate) === normalize(interest)),
  );
  if (sharedInterests.length) {
    score += Math.min(20, sharedInterests.length * 5);
    reasons.push(`Centres d’intérêt communs : ${sharedInterests.slice(0, 3).join(", ")}`);
  }

  const sharedLanguages = traveler.languages.filter((language) =>
    prefs.languages.some((candidate) => normalize(candidate) === normalize(language)),
  );
  if (sharedLanguages.length) {
    score += Math.min(10, sharedLanguages.length * 5);
    reasons.push(`Langue${sharedLanguages.length > 1 ? "s" : ""} commune${sharedLanguages.length > 1 ? "s" : ""} : ${sharedLanguages.slice(0, 2).join(", ")}`);
  }

  if (traveler.budgetEur && prefs.budgetEur && traveler.budgetEur > 0 && prefs.budgetEur > 0) {
    const difference = Math.abs(traveler.budgetEur - prefs.budgetEur);
    const ratio = difference / Math.max(traveler.budgetEur, prefs.budgetEur);
    const budgetPoints = ratio <= 0.15 ? 10 : ratio <= 0.35 ? 7 : ratio <= 0.6 ? 3 : 0;
    score += budgetPoints;
    if (budgetPoints >= 7) reasons.push("Budgets de voyage proches");
  }

  if (traveler.age !== null && traveler.age >= prefs.ageMin && traveler.age <= prefs.ageMax) {
    score += 10;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.slice(0, 4),
    sharedLanguages,
    sharedInterests,
    overlapDays: overlap,
  };
}

export function weatherCodeLabel(code: number | null | undefined) {
  if (code == null || !Number.isFinite(code)) return "Conditions inconnues";
  if (code === 0) return "Ciel dégagé";
  if ([1, 2].includes(code)) return "Partiellement nuageux";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Pluie";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orages";
  return "Météo variable";
}

export function paceLabel(pace: "relaxed" | "balanced" | "intense") {
  if (pace === "relaxed") return "tranquille";
  if (pace === "intense") return "intense";
  return "équilibré";
}
