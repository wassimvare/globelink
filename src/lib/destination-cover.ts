// Automatic cover photo for a trip, derived from its country / city.
import { COUNTRY_INFO } from "./country-info";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const FALLBACKS = [
  "photo-1476514525535-07fb3b4ae5f1",
  "photo-1500530855697-b586d89ba3ee",
  "photo-1469854523086-cc02fe5d8800",
  "photo-1507525428034-b723cf961d3e",
  "photo-1488646953014-85cb44e25828",
  "photo-1501785888041-af3ef285b470",
  "photo-1519681393784-d120267933ba",
  "photo-1504893524553-b855bce32c67",
];

const unsplash = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

// City-specific covers take priority over generic country covers.
// Each entry must be a photo verified to actually represent that city.
const CITY_COVERS: Record<string, string> = {
  lyon: unsplash("photo-1669275555278-986814008b68"),
};

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function countryDestinationCover(country?: string | null): string | null {
  const c = norm(country ?? "");
  if (!c) return null;

  const info = COUNTRY_INFO.find(
    (i) => norm(i.name) === c || norm(i.name).includes(c) || c.includes(norm(i.name)),
  );
  return info?.cover ?? null;
}

export function cityDestinationCover(city?: string | null): string | null {
  const ci = norm(city ?? "");
  if (!ci) return null;
  return CITY_COVERS[ci] ?? null;
}

/** Deterministic, always-defined cover image URL for a destination. */
export function destinationCover(country?: string | null, city?: string | null): string {
  const c = norm(country ?? "");
  const ci = norm(city ?? "");

  const cityCover = cityDestinationCover(city);
  if (cityCover) return cityCover;

  const countryCover = countryDestinationCover(country);
  if (countryCover) return countryCover;

  const seed = hash(`${c}|${ci}`);
  return unsplash(FALLBACKS[seed % FALLBACKS.length]);
}

/**
 * Resolve a stored trip cover without keeping an old generic country cover
 * when a verified city-specific cover now exists. This fixes legacy trips
 * (for example Lyon trips previously stored with the France/Paris cover)
 * while preserving genuinely custom covers.
 */
export function resolvedDestinationCover(
  storedCover?: string | null,
  country?: string | null,
  city?: string | null,
): string {
  const cityCover = cityDestinationCover(city);
  const countryCover = countryDestinationCover(country);
  const stored = String(storedCover ?? "").trim();

  if (cityCover && (!stored || (countryCover && stored === countryCover))) {
    return cityCover;
  }
  return stored || destinationCover(country, city);
}

/**
 * Only use destination covers that were explicitly stored by GlobeLink/admins.
 * The historical Unsplash fallback is intentionally rejected here because a
 * generic landscape must never be presented as a photograph of another country.
 */
export function verifiedDestinationCover(value?: string | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (/^(images\.)?unsplash\.com$/i.test(url.hostname)) return null;
    if (/^source\.unsplash\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
