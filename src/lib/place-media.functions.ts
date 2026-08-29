import { createServerFn } from "@tanstack/react-start";

export type PlaceMediaAttribution = {
  label: string;
  url?: string | null;
};

export type ResolvedPlaceMedia = {
  url: string | null;
  source:
    "google-places" | "official-site" | "wikidata" | "wikipedia" | "wikimedia" | "openverse" | null;
  matchedName?: string | null;
  attributions: PlaceMediaAttribution[];
};

export type PlaceMediaInput = {
  title: string;
  kind: "activity" | "restaurant" | "hotel" | "deal";
  latitude: number | null;
  longitude: number | null;
  city?: string | null;
  country?: string | null;
  wikidata?: string | null;
  wikipedia?: string | null;
  wikimediaCommons?: string | null;
  address?: string | null;
  website?: string | null;
  googlePhotoName?: string | null;
  googlePhotoAttributions?: Array<{ displayName?: string | null; uri?: string | null }>;
  skipGoogle?: boolean;
  skipOfficialSite?: boolean;
  fastOnly?: boolean;
};

type AnyRecord = Record<string, unknown>;

export function verifiedPlaceMediaQueryKey(
  placeId: string,
  input: PlaceMediaInput,
  variant = "primary",
) {
  return [
    "catalog-image",
    "verified-place-media-v8-public-verified",
    variant,
    placeId,
    input.title,
    input.kind,
    input.latitude ?? null,
    input.longitude ?? null,
    input.city ?? null,
    input.country ?? null,
    input.address ?? null,
    input.website ?? null,
    input.googlePhotoName ?? null,
    input.wikidata ?? null,
    input.wikipedia ?? null,
    input.wikimediaCommons ?? null,
    input.skipGoogle === true,
    input.skipOfficialSite === true,
    input.fastOnly === true,
  ] as const;
}

const USER_AGENT = "GlobeLink/10.9.10 (+https://globelink.app)";
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
  "los",
  "las",
  "del",
  "and",
  "&",
  "hostel",
  "resort",
  "apartments",
  "apartment",
]);

function cleanText(value: unknown, max = 180) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeHttps(value: unknown): string | null {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (/^(images\.)?unsplash\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeWebsite(value: unknown): string | null {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (/^(images\.)?unsplash\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !GENERIC_WORDS.has(token));
}

function nameSimilarity(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const leftTokens = significantTokens(left);
  const rightTokens = new Set(significantTokens(right));
  if (!leftTokens.length || !rightTokens.size) return 0;
  const matched = leftTokens.filter((token) => rightTokens.has(token)).length;
  return matched / Math.max(leftTokens.length, rightTokens.size);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function commonsFileUrl(value: unknown): string | null {
  const raw = cleanText(value, 1_000);
  if (!raw) return null;
  const direct = safeHttps(raw);
  if (direct) {
    try {
      const url = new URL(direct);
      if (url.hostname === "upload.wikimedia.org") return direct;
      if (url.hostname.endsWith("commons.wikimedia.org")) {
        const decoded = decodeURIComponent(url.pathname);
        const match = decoded.match(/\/(?:wiki\/)?File:(.+)$/i);
        if (match?.[1]) {
          return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(match[1])}?width=1600`;
        }
      }
    } catch {
      return null;
    }
  }
  const fileName = raw
    .replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\//i, "")
    .replace(/^File:/i, "")
    .trim();
  if (!fileName || /^Category:/i.test(fileName)) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=1600`;
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 6_000,
): Promise<AnyRecord | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) return null;
    const value = (await response.json()) as unknown;
    return value && typeof value === "object" ? (value as AnyRecord) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function wikidataImage(entityId: string): Promise<ResolvedPlaceMedia | null> {
  if (!/^Q\d+$/i.test(entityId)) return null;
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetclaims");
  url.searchParams.set("entity", entityId.toUpperCase());
  url.searchParams.set("property", "P18");
  url.searchParams.set("format", "json");
  const json = await fetchJson(url.toString());
  const claims = json?.claims as AnyRecord | undefined;
  const p18 = Array.isArray(claims?.P18) ? claims?.P18 : [];
  const first = (p18?.[0] ?? null) as AnyRecord | null;
  const mainsnak = first?.mainsnak as AnyRecord | undefined;
  const datavalue = mainsnak?.datavalue as AnyRecord | undefined;
  const fileName = cleanText(datavalue?.value, 600);
  const image = commonsFileUrl(fileName);
  if (!image) return null;
  return {
    url: image,
    source: "wikidata",
    matchedName: null,
    attributions: [
      {
        label: "Wikimedia Commons",
        url: `https://www.wikidata.org/wiki/${entityId.toUpperCase()}`,
      },
    ],
  };
}

async function wikipediaImage(reference: string): Promise<ResolvedPlaceMedia | null> {
  const match = cleanText(reference, 400).match(/^([a-z-]{2,12}):(.+)$/i);
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
  const json = await fetchJson(url.toString());
  const query = json?.query as AnyRecord | undefined;
  const pages = query?.pages as AnyRecord | undefined;
  const first = pages ? (Object.values(pages)[0] as AnyRecord | undefined) : undefined;
  const thumbnail = first?.thumbnail as AnyRecord | undefined;
  const image = safeHttps(thumbnail?.source);
  if (!image) return null;
  return {
    url: image,
    source: "wikipedia",
    matchedName: cleanText(first?.title) || title,
    attributions: [
      {
        label: "Wikipedia",
        url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      },
    ],
  };
}

async function resolveFromNominatim(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {
  if (input.latitude == null || input.longitude == null) return null;
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", input.latitude.toFixed(6));
  url.searchParams.set("lon", input.longitude.toFixed(6));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("namedetails", "1");
  const json = await fetchJson(
    url.toString(),
    { headers: { "Accept-Language": "fr,en;q=0.8" } },
    5_000,
  );
  const extra = (
    json?.extratags && typeof json.extratags === "object" ? json.extratags : {}
  ) as AnyRecord;
  const direct = safeHttps(extra.image) ?? commonsFileUrl(extra.wikimedia_commons);
  if (direct) {
    return {
      url: direct,
      source: "wikimedia",
      matchedName: cleanText(json?.name) || input.title,
      attributions: [{ label: "OpenStreetMap / Wikimedia", url: "https://www.openstreetmap.org" }],
    };
  }
  const wikidata = cleanText(extra.wikidata, 40);
  if (wikidata) {
    const result = await wikidataImage(wikidata);
    if (result) return result;
  }
  const wikipedia = cleanText(extra.wikipedia, 300);
  if (wikipedia) {
    const result = await wikipediaImage(wikipedia);
    if (result) return result;
  }

  if (!input.skipOfficialSite) {
    const website = safeWebsite(
      extra.website || extra["contact:website"] || extra.url || extra["contact:url"],
    );
    if (website) {
      const official = await resolveOfficialWebsiteImage(input, website);
      if (official) return official;
    }
  }
  return null;
}

async function resolveWikimediaNameSearch(
  input: PlaceMediaInput,
): Promise<ResolvedPlaceMedia | null> {
  const query =
    `"${input.title.replace(/"/g, "")}" ${[input.city, input.country].filter(Boolean).join(" ")}`.trim();
  if (!query) return null;

  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query.slice(0, 220));
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "12");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const json = await fetchJson(url.toString(), {}, 6_000);
  const queryData = json?.query as AnyRecord | undefined;
  const pages =
    queryData?.pages && typeof queryData.pages === "object"
      ? (Object.values(queryData.pages as AnyRecord) as AnyRecord[])
      : [];
  let best: { page: AnyRecord; image: string; score: number; title: string } | null = null;
  const placeTokens = significantTokens(input.title);
  const city = normalize(input.city ?? "");

  for (const page of pages) {
    const fileTitle = cleanText(page.title, 320).replace(/^File:/i, "");
    const imageInfo = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as AnyRecord | undefined) : undefined;
    if (!imageInfo) continue;
    const metadata =
      imageInfo.extmetadata && typeof imageInfo.extmetadata === "object"
        ? (imageInfo.extmetadata as AnyRecord)
        : {};
    const metadataValue = (key: string) => {
      const entry = metadata[key] as AnyRecord | undefined;
      return cleanText(entry?.value, 700);
    };
    const searchable = [
      fileTitle,
      metadataValue("ObjectName"),
      metadataValue("ImageDescription"),
      metadataValue("Categories"),
    ]
      .filter(Boolean)
      .join(" " );
    const similarity = nameSimilarity(input.title, searchable);
    const searchTokens = new Set(significantTokens(searchable));
    const matched = placeTokens.filter((token) => searchTokens.has(token)).length;
    const citySeen = !city || normalize(searchable).includes(city);
    if (similarity < 0.72) continue;
    if (placeTokens.length >= 2 && matched < Math.min(2, placeTokens.length)) continue;
    if (!citySeen && similarity < 0.9) continue;
    const image = safeHttps(imageInfo.thumburl) ?? safeHttps(imageInfo.url);
    if (!image) continue;
    const score = similarity * 100 + (citySeen ? 8 : 0) + matched * 4;
    if (!best || score > best.score) best = { page, image, score, title: fileTitle };
  }

  if (!best) return null;
  const commonsTitle = cleanText(best.page.title, 400);
  return {
    url: best.image,
    source: "wikimedia",
    matchedName: best.title || input.title,
    attributions: [
      {
        label: "Wikimedia Commons",
        url: commonsTitle
          ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(commonsTitle.replace(/ /g, "_"))}`
          : "https://commons.wikimedia.org/",
      },
    ],
  };
}

async function resolveWikidataSearch(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {
  if (input.latitude == null || input.longitude == null) return null;
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set(
    "search",
    [input.title, input.city, input.country].filter(Boolean).join(" "),
  );
  searchUrl.searchParams.set("language", "fr");
  searchUrl.searchParams.set("uselang", "fr");
  searchUrl.searchParams.set("type", "item");
  searchUrl.searchParams.set("limit", "6");
  searchUrl.searchParams.set("format", "json");
  const searchJson = await fetchJson(searchUrl.toString(), {}, 5_000);
  const hits = Array.isArray(searchJson?.search) ? (searchJson?.search as AnyRecord[]) : [];
  const ids = hits.map((hit) => cleanText(hit.id, 40)).filter((id) => /^Q\d+$/i.test(id));
  if (!ids.length) return null;

  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.searchParams.set("action", "wbgetentities");
  entityUrl.searchParams.set("ids", ids.join("|"));
  entityUrl.searchParams.set("props", "claims|labels|sitelinks");
  entityUrl.searchParams.set("languages", "fr|en|es");
  entityUrl.searchParams.set("format", "json");
  const entitiesJson = await fetchJson(entityUrl.toString(), {}, 6_000);
  const entities = (
    entitiesJson?.entities && typeof entitiesJson.entities === "object" ? entitiesJson.entities : {}
  ) as AnyRecord;

  let best: { id: string; entity: AnyRecord; score: number; name: string } | null = null;
  for (const id of ids) {
    const entity = entities[id] as AnyRecord | undefined;
    if (!entity) continue;
    const labels = (
      entity.labels && typeof entity.labels === "object" ? entity.labels : {}
    ) as AnyRecord;
    const name = cleanText(
      (labels.fr as AnyRecord | undefined)?.value ||
        (labels.en as AnyRecord | undefined)?.value ||
        (labels.es as AnyRecord | undefined)?.value,
    );
    const similarity = nameSimilarity(input.title, name);
    if (similarity < 0.58) continue;
    const claims = (
      entity.claims && typeof entity.claims === "object" ? entity.claims : {}
    ) as AnyRecord;
    const coordinatesClaims = Array.isArray(claims.P625) ? (claims.P625 as AnyRecord[]) : [];
    const coordinateValue = (
      (coordinatesClaims[0]?.mainsnak as AnyRecord | undefined)?.datavalue as AnyRecord | undefined
    )?.value as AnyRecord | undefined;
    const lat = Number(coordinateValue?.latitude);
    const lng = Number(coordinateValue?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const distance = haversineKm(input.latitude, input.longitude, lat, lng);
    if (distance > 5) continue;
    const score = similarity * 100 - distance * 8;
    if (!best || score > best.score) best = { id, entity, score, name };
  }
  if (!best) return null;
  const claims = (
    best.entity.claims && typeof best.entity.claims === "object" ? best.entity.claims : {}
  ) as AnyRecord;
  const p18 = Array.isArray(claims.P18) ? (claims.P18 as AnyRecord[]) : [];
  const fileName = cleanText(
    ((p18[0]?.mainsnak as AnyRecord | undefined)?.datavalue as AnyRecord | undefined)?.value,
    600,
  );
  const image = commonsFileUrl(fileName);
  if (image) {
    return {
      url: image,
      source: "wikidata",
      matchedName: best.name,
      attributions: [
        { label: "Wikimedia Commons", url: `https://www.wikidata.org/wiki/${best.id}` },
      ],
    };
  }
  const sitelinks = (
    best.entity.sitelinks && typeof best.entity.sitelinks === "object" ? best.entity.sitelinks : {}
  ) as AnyRecord;
  for (const language of ["fr", "en", "es"]) {
    const link = sitelinks[`${language}wiki`] as AnyRecord | undefined;
    const title = cleanText(link?.title, 300);
    if (!title) continue;
    const result = await wikipediaImage(`${language}:${title}`);
    if (result) return { ...result, matchedName: best.name };
  }
  return null;
}

type GooglePhoto = {
  name?: string;
  authorAttributions?: Array<{ displayName?: string; uri?: string }>;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  types?: string[];
  primaryType?: string;
  websiteUri?: string;
  photos?: GooglePhoto[];
};

function googleApiKey() {
  return cleanText(
    process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GLOBELINK_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY,
    512,
  );
}

function googleFieldMask(prefix = "places.") {
  return ["id", "displayName", "location", "formattedAddress", "types", "primaryType", "photos"]
    .map((field) => `${prefix}${field}`)
    .join(",");
}

const RESTAURANT_GOOGLE_TYPES = new Set([
  "restaurant",
  "cafe",
  "cafeteria",
  "coffee_shop",
  "bar",
  "bar_and_grill",
  "pub",
  "bistro",
  "bakery",
  "food_court",
  "meal_takeaway",
  "meal_delivery",
]);

const HOTEL_GOOGLE_TYPES = new Set([
  "hotel",
  "lodging",
  "motel",
  "resort_hotel",
  "hostel",
  "bed_and_breakfast",
  "extended_stay_hotel",
  "guest_house",
  "inn",
  "japanese_inn",
  "budget_japanese_inn",
  "private_guest_room",
  "farmstay",
  "cottage",
]);

const ACTIVITY_GOOGLE_TYPES = new Set([
  "tourist_attraction",
  "museum",
  "amusement_park",
  "aquarium",
  "zoo",
  "park",
  "city_park",
  "national_park",
  "state_park",
  "hiking_area",
  "sports_complex",
  "night_club",
  "historical_landmark",
  "scenic_spot",
  "observation_deck",
  "botanical_garden",
  "garden",
  "water_park",
  "wildlife_park",
  "event_venue",
  "live_music_venue",
]);

function expectedGoogleTypes(kind: PlaceMediaInput["kind"]) {
  if (kind === "restaurant") return RESTAURANT_GOOGLE_TYPES;
  if (kind === "hotel") return HOTEL_GOOGLE_TYPES;
  if (kind === "activity") return ACTIVITY_GOOGLE_TYPES;
  return new Set<string>();
}

function googleTypeMatches(
  kind: PlaceMediaInput["kind"],
  rawTypes: Array<string | null | undefined>,
) {
  const types = rawTypes.filter((value): value is string => !!value);
  if (kind === "restaurant") {
    return types.some(
      (type) =>
        RESTAURANT_GOOGLE_TYPES.has(type) ||
        type.endsWith("_restaurant") ||
        type.endsWith("_cafe") ||
        type.endsWith("_bar"),
    );
  }
  if (kind === "hotel") return types.some((type) => HOTEL_GOOGLE_TYPES.has(type));
  if (kind === "activity") return types.some((type) => ACTIVITY_GOOGLE_TYPES.has(type));
  return true;
}

function googlePlaceScore(input: PlaceMediaInput, place: GooglePlace) {
  const name = cleanText(place.displayName?.text, 240);
  const similarity = nameSimilarity(input.title, name);
  const minimumSimilarity = input.kind === "hotel" || input.kind === "restaurant" ? 0.6 : 0.48;
  if (similarity < minimumSimilarity) return null;
  const lat = Number(place.location?.latitude);
  const lng = Number(place.location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hasInputCoordinates = input.latitude != null && input.longitude != null;
  const distance = hasInputCoordinates
    ? haversineKm(input.latitude!, input.longitude!, lat, lng)
    : 0;
  // Dense city POIs should be extremely close. A larger tolerance remains useful
  // for OSM polygons whose center is not exactly on the Google pin.
  const maxDistance = input.kind === "hotel" || input.kind === "restaurant" ? 1.5 : 5;
  if (hasInputCoordinates && distance > maxDistance) return null;
  const formattedAddress = normalize(cleanText(place.formattedAddress, 320));
  const city = normalize(input.city ?? "");
  const country = normalize(input.country ?? "");
  const locationMatches =
    (!city || formattedAddress.includes(city)) && (!country || formattedAddress.includes(country));
  // User-added place pages can contain only name + city/country. Text Search
  // still finds their exact establishment; weak matches from another location
  // are rejected when precise coordinates are unavailable.
  if (!hasInputCoordinates && !locationMatches && similarity < 0.9) return null;
  const addressSimilarity = input.address
    ? nameSimilarity(input.address, cleanText(place.formattedAddress, 320))
    : 0;
  const expected = expectedGoogleTypes(input.kind);
  const rawTypes = [...(place.types ?? []), place.primaryType ?? ""];
  const typeMatch = expected.size ? googleTypeMatches(input.kind, rawTypes) : true;
  // For commercial POIs, keep a strict semantic guard, but understand Google's
  // specific subtypes (italian_restaurant, guest_house, etc.) instead of only
  // accepting a tiny hard-coded list.
  if ((input.kind === "hotel" || input.kind === "restaurant") && !typeMatch) return null;
  const hasPhotos = Array.isArray(place.photos) && place.photos.some((photo) => !!photo.name);
  return {
    name,
    distance,
    score:
      similarity * 100 -
      distance * 14 +
      addressSimilarity * 18 +
      (typeMatch ? 12 : 0) +
      (hasPhotos ? 24 : 0),
  };
}

async function googleTextSearch(input: PlaceMediaInput, key: string) {
  const textQuery = [input.title, input.address, input.city, input.country]
    .filter(Boolean)
    .join(", ");
  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": googleFieldMask(),
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "fr",
        maxResultCount: 16,
        ...(input.latitude != null && input.longitude != null
          ? {
              locationBias: {
                circle: {
                  center: { latitude: input.latitude, longitude: input.longitude },
                  radius: 2_500,
                },
              },
            }
          : {}),
      }),
    },
    6_000,
  );
  return Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
}

async function googleCompactTextSearch(input: PlaceMediaInput, key: string) {
  const textQuery = [input.title, input.city, input.country].filter(Boolean).join(", ");
  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": googleFieldMask(),
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "fr",
        maxResultCount: 12,
        ...(input.latitude != null && input.longitude != null
          ? {
              locationBias: {
                circle: {
                  center: { latitude: input.latitude, longitude: input.longitude },
                  radius: input.kind === "activity" ? 5_000 : 3_000,
                },
              },
            }
          : {}),
      }),
    },
    5_000,
  );
  return Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
}

async function googleNearbySearch(input: PlaceMediaInput, key: string) {
  if (input.latitude == null || input.longitude == null) return [] as GooglePlace[];
  const json = await fetchJson(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": googleFieldMask(),
      },
      body: JSON.stringify({
        languageCode: "fr",
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        ...(input.kind === "restaurant"
          ? { includedTypes: ["restaurant", "cafe", "bar", "bakery", "meal_takeaway"] }
          : input.kind === "hotel"
            ? {
                includedTypes: [
                  "hotel",
                  "hostel",
                  "motel",
                  "resort_hotel",
                  "bed_and_breakfast",
                  "guest_house",
                  "lodging",
                ],
              }
            : {}),
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.kind === "activity" ? 1_500 : 900,
          },
        },
      }),
    },
    6_000,
  );
  return Array.isArray(json?.places) ? (json?.places as GooglePlace[]) : [];
}

async function googlePlaceDetails(placeId: string, key: string, includeWebsite: boolean) {
  if (!placeId) return null;
  const fields = ["photos"];
  if (includeWebsite) fields.push("websiteUri");
  return (await fetchJson(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fields.join(","),
      },
    },
    6_000,
  )) as GooglePlace | null;
}

async function googlePhotoMedia(photo: GooglePhoto, key: string) {
  if (!photo?.name) return null;
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
  mediaUrl.searchParams.set("maxWidthPx", "1600");
  mediaUrl.searchParams.set("skipHttpRedirect", "true");
  mediaUrl.searchParams.set("key", key);
  const mediaJson = await fetchJson(mediaUrl.toString(), {}, 6_000);
  const photoUri = safeHttps(mediaJson?.photoUri);
  if (!photoUri) return null;
  const attributions = (photo.authorAttributions ?? [])
    .map((item) => ({ label: cleanText(item.displayName, 120), url: safeHttps(item.uri) }))
    .filter((item) => !!item.label);
  return { photoUri, attributions };
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return true;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

function isPrivateIp(ip: string) {
  if (ip.includes(".")) return isPrivateIpv4(ip.replace(/^::ffff:/i, ""));
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

async function publicWebsiteUrl(value: unknown): Promise<URL | null> {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const hostname = url.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    return null;
  try {
    const { isIP } = await import("node:net");
    if (isIP(hostname)) return isPrivateIp(hostname) ? null : url;
    const { lookup } = await import("node:dns/promises");
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) return null;
  } catch {
    return null;
  }
  return url;
}

async function fetchPublicHtml(value: unknown, timeoutMs = 5_000) {
  let current = await publicWebsiteUrl(value);
  if (!current) return null;
  for (let redirect = 0; redirect < 3; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "User-Agent": USER_AGENT,
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        const next = await publicWebsiteUrl(new URL(location, current).toString());
        if (!next) return null;
        current = next;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let html = "";
      while (html.length < 700_000) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        html += decoder.decode(chunk, { stream: true });
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

function htmlEntityDecode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return htmlEntityDecode(match[1].trim());
  }
  return null;
}

function schemaImage(html: string) {
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = match[1]?.trim();
    if (!raw || raw.length > 250_000) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const queue = Array.isArray(data) ? [...data] : [data];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const image = record.image;
        if (typeof image === "string") return image;
        if (Array.isArray(image)) {
          const first = image.find((value) => typeof value === "string");
          if (typeof first === "string") return first;
        }
        if (
          image &&
          typeof image === "object" &&
          typeof (image as Record<string, unknown>).url === "string"
        )
          return String((image as Record<string, unknown>).url);
        const graph = record["@graph"];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    } catch {
      // malformed JSON-LD is common; ignore it and continue with meta tags.
    }
  }
  return null;
}

const THIRD_PARTY_WEBSITE_HOSTS = [
  "parclick.com",
  "booking.com",
  "tripadvisor.com",
  "tripadvisor.fr",
  "expedia.com",
  "expedia.fr",
  "hotels.com",
  "agoda.com",
  "thefork.com",
  "thefork.fr",
  "opentable.com",
  "yelp.com",
  "parkopedia.com",
  "justpark.com",
  "onepark.fr",
  "onepark.co",
  "parkimeter.com",
  "airbnb.com",
  "kayak.com",
  "trivago.com",
];

function hostMatches(hostname: string, domain: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  const expected = domain.replace(/^www\./i, "").toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

function isThirdPartyWebsite(hostname: string) {
  return THIRD_PARTY_WEBSITE_HOSTS.some((domain) => hostMatches(hostname, domain));
}

function firstHtmlText(html: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]{0,1200}?)<\\/${escaped}>`, "i"));
  if (!match?.[1]) return null;
  return htmlEntityDecode(
    match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function schemaNames(html: string) {
  const names: string[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const raw = match[1]?.trim();
    if (!raw || raw.length > 250_000) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length && names.length < 12) {
        const value = queue.shift();
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (typeof record.name === "string") names.push(cleanText(record.name, 220));
        if (typeof record.headline === "string") names.push(cleanText(record.headline, 220));
        if (Array.isArray(record["@graph"])) queue.push(...(record["@graph"] as unknown[]));
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return names.filter(Boolean);
}

function websiteIdentityText(html: string) {
  return [
    metaContent(html, "og:title"),
    metaContent(html, "twitter:title"),
    firstHtmlText(html, "title"),
    firstHtmlText(html, "h1"),
    ...schemaNames(html),
  ]
    .filter((value): value is string => !!value)
    .join(" · ")
    .slice(0, 2_500);
}

function websiteIdentityMatches(input: PlaceMediaInput, page: { html: string; finalUrl: string }) {
  let url: URL;
  try {
    url = new URL(page.finalUrl);
  } catch {
    return false;
  }
  if (isThirdPartyWebsite(url.hostname)) return false;

  const identity = websiteIdentityText(page.html);
  if (!identity) return false;
  const similarity = nameSimilarity(input.title, identity);
  const titleTokens = significantTokens(input.title).filter((token) => token.length >= 3);
  const evidenceTokens = new Set(
    significantTokens(`${identity} ${url.hostname.replace(/[.-]/g, " ")}`),
  );
  const matchedTokens = titleTokens.filter((token) => evidenceTokens.has(token)).length;
  const requiredTokens = titleTokens.length <= 1 ? 1 : Math.min(2, titleTokens.length);
  const tokenMatch = titleTokens.length > 0 && matchedTokens >= requiredTokens;

  // One strong brand/name match is enough (e.g. Novotel on all.accor.com), but a
  // generic booking/parking page that merely sits near the POI is rejected.
  return similarity >= 0.68 || tokenMatch;
}

async function resolveOfficialWebsiteImage(
  input: PlaceMediaInput,
  website: unknown,
): Promise<ResolvedPlaceMedia | null> {
  const page = await fetchPublicHtml(website);
  if (!page || !websiteIdentityMatches(input, page)) return null;
  const candidates = [
    metaContent(page.html, "og:image"),
    metaContent(page.html, "og:image:secure_url"),
    metaContent(page.html, "twitter:image"),
    schemaImage(page.html),
  ].filter((value): value is string => !!value);
  for (const candidate of candidates) {
    let resolved: string;
    try {
      resolved = new URL(candidate, page.finalUrl).toString();
    } catch {
      continue;
    }
    const image = safeHttps(resolved);
    if (!image) continue;
    const source = new URL(page.finalUrl);
    return {
      url: image,
      source: "official-site",
      matchedName: input.title,
      attributions: [
        { label: `Site officiel · ${source.hostname.replace(/^www\./, "")}`, url: page.finalUrl },
      ],
    };
  }
  return null;
}

async function resolveGooglePlaces(
  input: PlaceMediaInput,
): Promise<{ media: ResolvedPlaceMedia | null; website: string | null }> {
  const key = googleApiKey();
  if (!key) return { media: null, website: null };

  const [textPlaces, nearbyPlaces] = await Promise.all([
    googleTextSearch(input, key),
    input.latitude != null && input.longitude != null
      ? googleNearbySearch(input, key)
      : Promise.resolve([]),
  ]);
  const unique = new Map<string, GooglePlace>();
  for (const place of [...textPlaces, ...nearbyPlaces]) {
    const id = cleanText(place.id, 200);
    if (!id) continue;
    const previous = unique.get(id);
    unique.set(
      id,
      previous
        ? { ...previous, ...place, photos: place.photos?.length ? place.photos : previous.photos }
        : place,
    );
  }

  const rankPlaces = () =>
    [...unique.values()]
      .map((place) => {
        const scored = googlePlaceScore(input, place);
        return scored ? { place, ...scored } : null;
      })
      .filter(
        (entry): entry is { place: GooglePlace; name: string; distance: number; score: number } =>
          !!entry,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

  let ranked = rankPlaces();
  // OSM names/addresses are sometimes incomplete. If the strict first pass did
  // not produce a convincing candidate, retry once with a shorter query around
  // the exact coordinates rather than giving up on an establishment that Google
  // actually knows.
  if (!ranked.length) {
    const compactPlaces = await googleCompactTextSearch(input, key);
    for (const place of compactPlaces) {
      const id = cleanText(place.id, 200);
      if (!id) continue;
      const previous = unique.get(id);
      unique.set(
        id,
        previous
          ? { ...previous, ...place, photos: place.photos?.length ? place.photos : previous.photos }
          : place,
      );
    }
    ranked = rankPlaces();
  }

  let bestWebsite: string | null = null;
  for (const candidate of ranked) {
    const id = cleanText(candidate.place.id, 200);
    if (!id) continue;
    let place = candidate.place;
    let website = safeWebsite(place.websiteUri);

    // Search responses can omit or contain stale photo refs. Try a few refs before
    // falling back to Place Details, then try the next high-confidence candidate.
    const tryPhotos = async (photos: GooglePhoto[] | undefined) => {
      for (const photo of (photos ?? []).filter((entry) => !!entry.name).slice(0, 8)) {
        const media = await googlePhotoMedia(photo, key);
        if (!media) continue;
        return {
          url: media.photoUri,
          source: "google-places" as const,
          matchedName: candidate.name,
          attributions: media.attributions,
        } satisfies ResolvedPlaceMedia;
      }
      return null;
    };

    const fromSearch = await tryPhotos(place.photos);
    if (fromSearch) return { media: fromSearch, website };

    const details = await googlePlaceDetails(id, key, true);
    if (details) {
      place = { ...place, ...details };
      website = safeWebsite(place.websiteUri) ?? website;
      const fromDetails = await tryPhotos(place.photos);
      if (fromDetails) return { media: fromDetails, website };
    }
    if (!bestWebsite && website) bestWebsite = website;
  }

  return { media: null, website: bestWebsite };
}

type OpenverseResult = {
  title?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  foreign_landing_url?: string | null;
  attribution?: string | null;
  license?: string | null;
  license_url?: string | null;
  source?: string | null;
  tags?: Array<{ name?: string }>;
};

function openverseMatchScore(input: PlaceMediaInput, result: OpenverseResult) {
  const title = cleanText(result.title, 300);
  const tagText = (result.tags ?? []).map((tag) => cleanText(tag.name, 80)).join(" ");
  const searchable = `${title} ${tagText}`;
  const similarity = nameSimilarity(input.title, searchable);
  const exact = normalize(title) === normalize(input.title);
  const placeTokens = significantTokens(input.title);
  const searchTokens = new Set(significantTokens(searchable));
  const matched = placeTokens.filter((token) => searchTokens.has(token)).length;
  const city = normalize(input.city ?? "");
  const citySeen = !city || normalize(searchable).includes(city);
  if (!exact && similarity < 0.72) return 0;
  if (placeTokens.length >= 2 && matched < Math.min(2, placeTokens.length)) return 0;
  if (!exact && !citySeen && similarity < 0.9) return 0;
  return similarity * 100 + (exact ? 25 : 0) + (citySeen ? 5 : 0);
}

async function resolveOpenverse(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {
  const query =
    `"${input.title.replace(/"/g, "")}" ${[input.city, input.country].filter(Boolean).join(" ")}`.trim();
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query.slice(0, 200));
  url.searchParams.set("page_size", "12");
  url.searchParams.set("mature", "false");
  const json = await fetchJson(url.toString(), {}, 6_000);
  const results = Array.isArray(json?.results) ? (json?.results as OpenverseResult[]) : [];
  let best: { result: OpenverseResult; score: number } | null = null;
  for (const result of results) {
    const image = safeHttps(result.thumbnail) ?? safeHttps(result.url);
    if (!image) continue;
    const score = openverseMatchScore(input, result);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { result, score };
  }
  if (!best) return null;
  const image = safeHttps(best.result.thumbnail) ?? safeHttps(best.result.url);
  if (!image) return null;
  const attributionLabel =
    cleanText(best.result.attribution, 220) ||
    `Openverse${best.result.source ? ` · ${cleanText(best.result.source, 80)}` : ""}`;
  return {
    url: image,
    source: "openverse",
    matchedName: cleanText(best.result.title, 240) || input.title,
    attributions: [
      {
        label: attributionLabel,
        url: safeHttps(best.result.foreign_landing_url) ?? safeHttps(best.result.license_url),
      },
    ],
  };
}

function validateInput(data: PlaceMediaInput): PlaceMediaInput {
  const title = cleanText(data?.title, 180);
  if (title.length < 2) throw new Error("Nom de lieu invalide");
  const latitudeRaw = data?.latitude;
  const longitudeRaw = data?.longitude;
  const latitude = latitudeRaw == null ? null : Number(latitudeRaw);
  const longitude = longitudeRaw == null ? null : Number(longitudeRaw);
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
    throw new Error("Latitude invalide");
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    throw new Error("Longitude invalide");
  if ((latitude == null) !== (longitude == null)) throw new Error("Coordonnées incomplètes");
  const kind = ["activity", "restaurant", "hotel", "deal"].includes(data?.kind)
    ? data.kind
    : "activity";
  return {
    title,
    kind,
    latitude,
    longitude,
    city: cleanText(data?.city, 100) || null,
    country: cleanText(data?.country, 100) || null,
    wikidata: /^Q\d+$/i.test(cleanText(data?.wikidata, 40))
      ? cleanText(data?.wikidata, 40).toUpperCase()
      : null,
    wikipedia: /^[a-z-]{2,12}:.+/i.test(cleanText(data?.wikipedia, 300))
      ? cleanText(data?.wikipedia, 300)
      : null,
    wikimediaCommons: cleanText(data?.wikimediaCommons, 600) || null,
    address: cleanText(data?.address, 320) || null,
    website: safeWebsite(data?.website),
    googlePhotoName: cleanText(data?.googlePhotoName, 600) || null,
    googlePhotoAttributions: Array.isArray(data?.googlePhotoAttributions)
      ? data.googlePhotoAttributions
          .map((item) => ({
            displayName: cleanText(item?.displayName, 120) || null,
            uri: safeHttps(item?.uri),
          }))
          .filter((item) => !!item.displayName)
          .slice(0, 4)
      : [],
    skipGoogle: data?.skipGoogle === true,
    skipOfficialSite: data?.skipOfficialSite === true,
    fastOnly: data?.fastOnly === true,
  };
}

export const resolveVerifiedPlaceMedia = createServerFn({ method: "POST" })
  .validator((data: PlaceMediaInput) => validateInput(data))
  .handler(async ({ data }) => {
    const commons = commonsFileUrl(data.wikimediaCommons);
    if (commons) {
      return {
        url: commons,
        source: "wikimedia",
        matchedName: data.title,
        attributions: [{ label: "Wikimedia Commons", url: "https://commons.wikimedia.org" }],
      } satisfies ResolvedPlaceMedia;
    }

    if (data.wikidata) {
      const result = await wikidataImage(data.wikidata);
      if (result) return result;
    }
    if (data.wikipedia) {
      const result = await wikipediaImage(data.wikipedia);
      if (result) return result;
    }

    // Destination searches can already return an exact Google Places photo
    // reference. Resolve that server-side first: it is both faster and safer than
    // searching the establishment again by name, and the API key stays private.
    if (!data.skipGoogle && data.googlePhotoName) {
      const key = googleApiKey();
      if (key) {
        const directGoogle = await googlePhotoMedia(
          {
            name: data.googlePhotoName,
            authorAttributions: (data.googlePhotoAttributions ?? []).map((item) => ({
              displayName: item.displayName ?? undefined,
              uri: item.uri ?? undefined,
            })),
          },
          key,
        );
        if (directGoogle) {
          return {
            url: directGoogle.photoUri,
            source: "google-places",
            matchedName: data.title,
            attributions: directGoogle.attributions.length
              ? directGoogle.attributions
              : [{ label: "Google Places" }],
          } satisfies ResolvedPlaceMedia;
        }
      }
    }

    // Google Places is the highest-coverage source when a server-only key is configured.
    // The key never reaches the browser. Text + Nearby improve exact-place matching.
    const google = data.skipGoogle
      ? { media: null, website: null }
      : await resolveGooglePlaces(data);
    if (google.media) return google.media;
    if (data.fastOnly) {
      return {
        url: null,
        source: null,
        matchedName: null,
        attributions: [],
      } satisfies ResolvedPlaceMedia;
    }

    // If OSM already knows the establishment website, prefer its own hero image
    // over any generic illustration. Google can also provide the official site
    // when the place has no photo in Places.
    if (!data.skipOfficialSite) {
      // Google Places' website belongs to the matched place and is therefore tried
      // before the raw OSM website tag, which can occasionally point to a booking,
      // parking or aggregator page. Every candidate still has to pass identity checks.
      const websiteCandidates = [
        ...new Set([google.website, data.website].filter((value): value is string => !!value)),
      ];
      for (const website of websiteCandidates) {
        const official = await resolveOfficialWebsiteImage(data, website);
        if (official) return official;
      }
    }

    const allowsOpenKnowledgeFallback =
      data.kind === "activity" && !!(data.wikidata || data.wikipedia || data.wikimediaCommons);
    if (!allowsOpenKnowledgeFallback) {
      return {
        url: null,
        source: null,
        matchedName: null,
        attributions: [],
      } satisfies ResolvedPlaceMedia;
    }

    const nominatim = await resolveFromNominatim(data);
    if (nominatim) return nominatim;

    const wikidataSearch = await resolveWikidataSearch(data);
    if (wikidataSearch) return wikidataSearch;

    const wikimediaNameSearch = await resolveWikimediaNameSearch(data);
    if (wikimediaNameSearch) return wikimediaNameSearch;

    const openverse = await resolveOpenverse(data);
    if (openverse) return openverse;

    return {
      url: null,
      source: null,
      matchedName: null,
      attributions: [],
    } satisfies ResolvedPlaceMedia;
  });
