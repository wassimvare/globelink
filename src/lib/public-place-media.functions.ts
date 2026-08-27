import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createServerFn } from "@tanstack/react-start";

export type PublicPlaceMediaInput = {
  title: string;
  kind: "activity" | "restaurant" | "hotel" | "deal";
  latitude: number | null;
  longitude: number | null;
  city?: string | null;
  country?: string | null;
};

export type PublicPlaceMediaResult = {
  url: string | null;
  source: "official-site" | "osm-wikimedia" | "wikidata" | "wikipedia" | null;
  matchedName: string | null;
  attributions: Array<{ label: string; url?: string | null }>;
};

type AnyRecord = Record<string, unknown>;

type CacheEntry = { expires: number; value: PublicPlaceMediaResult };
const CACHE_TTL = 12 * 60 * 60_000;
const cache = new Map<string, CacheEntry>();
const USER_AGENT = "GlobeLink/11.0 (+https://github.com/wassimvare/globelink)";

const GENERIC_WORDS = new Set([
  "hotel",
  "hôtel",
  "restaurant",
  "cafe",
  "café",
  "bar",
  "the",
  "le",
  "la",
  "les",
  "de",
  "des",
  "du",
  "el",
  "and",
  "ibis",
]);

function clean(value: unknown, max = 400) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalize(value: unknown) {
  return clean(value, 800)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !GENERIC_WORDS.has(token));
}

function similarity(left: unknown, right: unknown) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.93;
  const aa = tokens(left);
  const bb = new Set(tokens(right));
  if (!aa.length || !bb.size) return 0;
  const hit = aa.filter((token) => bb.has(token)).length;
  return hit / Math.max(aa.length, bb.size);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeHttps(value: unknown): string | null {
  try {
    const url = new URL(clean(value, 2500));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeWebsite(value: unknown): URL | null {
  try {
    const url = new URL(clean(value, 2500));
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
      return null;
    return url;
  } catch {
    return null;
  }
}

function privateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function privateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:192.168.")
  );
}

function privateIp(ip: string) {
  const version = isIP(ip);
  if (version === 4) return privateIpv4(ip);
  if (version === 6) return privateIpv6(ip);
  return true;
}

async function isSafePublicUrl(url: URL) {
  if (isIP(url.hostname)) return !privateIp(url.hostname);
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => !privateIp(entry.address));
  } catch {
    return false;
  }
}

async function fetchJson(url: string, timeoutMs = 6500): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, "Accept-Language": "fr,en;q=0.8" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function htmlEntityDecode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function metaValue(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlEntityDecode(match[1].trim());
  }
  return null;
}

function pageTitle(html: string) {
  return (
    metaValue(html, "og:title") ||
    metaValue(html, "twitter:title") ||
    htmlEntityDecode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "")
  ).trim();
}

async function fetchOfficialPage(start: URL) {
  let current = start;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!(await isSafePublicUrl(current))) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": USER_AGENT,
          "Accept-Language": "fr,en;q=0.8",
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? "";
      if (!type.toLowerCase().includes("text/html")) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let html = "";
      while (html.length < 700_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      return { html: html.slice(0, 700_000), finalUrl: current.toString() };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function officialWebsitePhoto(input: PublicPlaceMediaInput, website: unknown) {
  const url = safeWebsite(website);
  if (!url) return null;
  const page = await fetchOfficialPage(url);
  if (!page) return null;
  const identity = pageTitle(page.html);
  const match = similarity(input.title, identity);
  const placeTokens = tokens(input.title);
  const identityTokens = new Set(tokens(identity));
  const shared = placeTokens.filter((token) => identityTokens.has(token)).length;
  if (match < 0.5 && shared < Math.min(2, Math.max(1, placeTokens.length))) return null;

  const candidate =
    metaValue(page.html, "og:image:secure_url") ||
    metaValue(page.html, "og:image") ||
    metaValue(page.html, "twitter:image");
  if (!candidate) return null;
  let image: string | null = null;
  try {
    image = safeHttps(new URL(candidate, page.finalUrl).toString());
  } catch {
    image = null;
  }
  if (!image) return null;
  const host = new URL(page.finalUrl).hostname.replace(/^www\./, "");
  return {
    url: image,
    source: "official-site" as const,
    matchedName: identity || input.title,
    attributions: [{ label: `Site officiel · ${host}`, url: page.finalUrl }],
  };
}

function commonsFileUrl(value: unknown) {
  const raw = clean(value, 1000);
  if (!raw) return null;
  const direct = safeHttps(raw);
  if (direct) {
    try {
      const parsed = new URL(direct);
      if (parsed.hostname === "upload.wikimedia.org") return direct;
    } catch {
      // continue with a filename interpretation
    }
  }
  const name = raw
    .replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\//i, "")
    .replace(/^File:/i, "")
    .trim();
  if (!name || /^Category:/i.test(name)) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=1600`;
}

async function wikidataPhoto(id: string): Promise<PublicPlaceMediaResult | null> {
  if (!/^Q\d+$/i.test(id)) return null;
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetclaims");
  url.searchParams.set("entity", id.toUpperCase());
  url.searchParams.set("property", "P18");
  url.searchParams.set("format", "json");
  const json = (await fetchJson(url.toString())) as AnyRecord | null;
  const claims = json?.claims as AnyRecord | undefined;
  const rows = Array.isArray(claims?.P18) ? (claims?.P18 as AnyRecord[]) : [];
  const file = clean(
    ((((rows[0]?.mainsnak as AnyRecord | undefined)?.datavalue as AnyRecord | undefined)?.value)),
    700,
  );
  const image = commonsFileUrl(file);
  if (!image) return null;
  return {
    url: image,
    source: "wikidata",
    matchedName: null,
    attributions: [{ label: "Wikimedia Commons", url: `https://www.wikidata.org/wiki/${id.toUpperCase()}` }],
  };
}

async function wikipediaPhoto(reference: string): Promise<PublicPlaceMediaResult | null> {
  const match = clean(reference, 500).match(/^([a-z-]{2,12}):(.+)$/i);
  if (!match) return null;
  const language = match[1].toLowerCase();
  const title = match[2].trim();
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "1600");
  url.searchParams.set("titles", title);
  url.searchParams.set("format", "json");
  const json = (await fetchJson(url.toString())) as AnyRecord | null;
  const pages = (json?.query as AnyRecord | undefined)?.pages as AnyRecord | undefined;
  const first = pages ? (Object.values(pages)[0] as AnyRecord | undefined) : undefined;
  const image = safeHttps((first?.thumbnail as AnyRecord | undefined)?.source);
  if (!image) return null;
  return {
    url: image,
    source: "wikipedia",
    matchedName: clean(first?.title, 250) || title,
    attributions: [{ label: "Wikipedia", url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` }],
  };
}

async function resolveFromNominatim(input: PublicPlaceMediaInput): Promise<PublicPlaceMediaResult | null> {
  const query = [input.title, input.city, input.country].filter(Boolean).join(", ");
  if (!query) return null;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", query.slice(0, 280));
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  if (input.latitude != null && input.longitude != null) {
    url.searchParams.set(
      "viewbox",
      `${(input.longitude - 0.035).toFixed(6)},${(input.latitude + 0.025).toFixed(6)},${(input.longitude + 0.035).toFixed(6)},${(input.latitude - 0.025).toFixed(6)}`,
    );
    url.searchParams.set("bounded", "0");
  }

  const json = await fetchJson(url.toString());
  const results = Array.isArray(json) ? (json as AnyRecord[]) : [];
  let best: { row: AnyRecord; name: string; score: number } | null = null;
  for (const row of results) {
    const named = row.namedetails && typeof row.namedetails === "object" ? (row.namedetails as AnyRecord) : {};
    const display = clean(row.display_name, 500);
    const name =
      clean(row.name, 240) ||
      clean(named.name, 240) ||
      clean(named["name:fr"], 240) ||
      display.split(",")[0]?.trim() ||
      "";
    const nameScore = Math.max(similarity(input.title, name), similarity(input.title, display));
    if (nameScore < 0.56) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    let distance = 0;
    if (
      input.latitude != null &&
      input.longitude != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      distance = haversineKm(input.latitude, input.longitude, lat, lng);
      if (distance > 4) continue;
    }
    const score = nameScore * 100 - distance * 10;
    if (!best || score > best.score) best = { row, name, score };
  }
  if (!best) return null;

  const extra = best.row.extratags && typeof best.row.extratags === "object" ? (best.row.extratags as AnyRecord) : {};
  const direct = safeHttps(extra.image) ?? commonsFileUrl(extra.wikimedia_commons);
  if (direct) {
    return {
      url: direct,
      source: "osm-wikimedia",
      matchedName: best.name || input.title,
      attributions: [{ label: "OpenStreetMap / Wikimedia", url: "https://www.openstreetmap.org" }],
    };
  }

  const wikidata = clean(extra.wikidata, 50);
  if (wikidata) {
    const media = await wikidataPhoto(wikidata);
    if (media) return { ...media, matchedName: best.name || media.matchedName };
  }
  const wikipedia = clean(extra.wikipedia, 350);
  if (wikipedia) {
    const media = await wikipediaPhoto(wikipedia);
    if (media) return { ...media, matchedName: best.name || media.matchedName };
  }

  const website = extra.website || extra["contact:website"] || extra.url || extra["contact:url"];
  const official = await officialWebsitePhoto(input, website);
  if (official) return official;
  return null;
}

function validateInput(raw: PublicPlaceMediaInput): PublicPlaceMediaInput {
  const title = clean(raw?.title, 220);
  const kind = ["activity", "restaurant", "hotel", "deal"].includes(String(raw?.kind))
    ? raw.kind
    : "activity";
  const latitude = raw?.latitude == null ? null : Number(raw.latitude);
  const longitude = raw?.longitude == null ? null : Number(raw.longitude);
  return {
    title,
    kind,
    latitude: Number.isFinite(latitude) && latitude! >= -90 && latitude! <= 90 ? latitude : null,
    longitude: Number.isFinite(longitude) && longitude! >= -180 && longitude! <= 180 ? longitude : null,
    city: clean(raw?.city, 120) || null,
    country: clean(raw?.country, 120) || null,
  };
}

export function publicPlaceMediaQueryKey(input: PublicPlaceMediaInput) {
  return [
    "public-place-media-v1",
    input.title,
    input.kind,
    input.latitude ?? null,
    input.longitude ?? null,
    input.city ?? null,
    input.country ?? null,
  ] as const;
}

export const resolvePublicPlaceMedia = createServerFn({ method: "POST" })
  .validator((data: PublicPlaceMediaInput) => validateInput(data))
  .handler(async ({ data }) => {
    if (!data.title) {
      return { url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult;
    }
    const key = publicPlaceMediaQueryKey(data).join("|");
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value =
      (await resolveFromNominatim(data)) ??
      ({ url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult);
    cache.set(key, { expires: Date.now() + CACHE_TTL, value });
    return value;
  });
