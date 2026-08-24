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

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic, always-defined cover image URL for a destination. */
export function destinationCover(country?: string | null, city?: string | null): string {
  const c = norm(country ?? "");
  const ci = norm(city ?? "");

  if (c) {
    const info = COUNTRY_INFO.find(
      (i) => norm(i.name) === c || norm(i.name).includes(c) || c.includes(norm(i.name)),
    );
    if (info) return info.cover;
  }
  const seed = hash(`${c}|${ci}`);
  return unsplash(FALLBACKS[seed % FALLBACKS.length]);
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
