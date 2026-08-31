import { fetchOfficialCatalogRows } from "./official-catalog-apis.functions";
import { geocodeCityForServer } from "./place-geocoding.functions";
import type {
  TravelPriceSearchContext,
  TravelPriceSource,
  VerifiedHotelEvidence,
} from "./travel-price-sources.server";

const BOOKING_REQUEST_TIMEOUT_MS = 7_000;
const HOTEL_RESULT_CACHE_TTL_MS = 5 * 60_000;
const MAX_BOOKING_RESULTS = 30;
const MAX_HOTEL_SOURCES = 8;

type JsonRecord = Record<string, unknown>;

export type HotelStay = {
  checkin: string;
  checkout: string;
  nights: number;
  travelers: number;
  rooms: number;
  occupancyAssumed: boolean;
};

type BookingConfiguration = {
  token: string;
  affiliateId: string | null;
  baseUrl: string;
  searchEndpoint: string;
  bookerCountry: string;
  platform: "desktop" | "mobile" | "tablet";
};

type BookingHotelParseInput = {
  searchRow: JsonRecord;
  detailsRow?: JsonRecord | null;
  stay: HotelStay;
  checkedAt: string;
};

const resultCache = new Map<string, { expiresAt: number; sources: TravelPriceSource[] }>();

function cleanText(value: unknown, max = 300) {
  return (
    String(value ?? "")
      .normalize("NFKC")
      // eslint-disable-next-line no-control-regex -- provider data is untrusted input
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max)
  );
}

function normalized(value: unknown) {
  return cleanText(value, 300)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeHttps(value: unknown) {
  try {
    const url = new URL(cleanText(value, 2_000));
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function localizedString(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return cleanText(value, 500);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["fr", "fr-fr", "en-gb", "en", "name", "text"]) {
    const direct = record[key];
    if (typeof direct === "string" && cleanText(direct, 500)) return cleanText(direct, 500);
  }
  for (const direct of Object.values(record)) {
    if (typeof direct === "string" && cleanText(direct, 500)) return cleanText(direct, 500);
  }
  return "";
}

function firstString(value: unknown, paths: string[]) {
  for (const path of paths) {
    const result = localizedString(getPath(value, path));
    if (result) return result;
  }
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "string" && !value.trim()) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function firstNumber(value: unknown, paths: string[]) {
  for (const path of paths) {
    const result = numberValue(getPath(value, path));
    if (result !== null) return result;
  }
  return null;
}

function firstHttps(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = getPath(value, path);
    const direct = safeHttps(candidate);
    if (direct) return direct;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      for (const nested of Object.values(candidate as Record<string, unknown>)) {
        const nestedUrl = safeHttps(nested);
        if (nestedUrl) return nestedUrl;
      }
    }
  }
  return null;
}

function dataRows(value: unknown): JsonRecord[] {
  if (Array.isArray(value))
    return value.filter((row): row is JsonRecord => !!row && typeof row === "object");
  const data = getPath(value, "data");
  return Array.isArray(data)
    ? data.filter((row): row is JsonRecord => !!row && typeof row === "object")
    : [];
}

function isoDay(value: unknown) {
  const day = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function utcDayNumber(value: string) {
  return Date.parse(`${value}T12:00:00Z`);
}

function explicitRoomCount(query: string) {
  const match = normalized(query).match(/\b(\d{1,2})\s*(?:chambre|chambres|room|rooms)\b/);
  return match ? Number(match[1]) : null;
}

export function buildHotelStay(
  context: Pick<TravelPriceSearchContext, "startsOn" | "endsOn" | "travelers" | "query">,
  now = new Date(),
): HotelStay | null {
  const checkin = isoDay(context.startsOn);
  const checkout = isoDay(context.endsOn);
  if (!checkin || !checkout) return null;

  const checkinMs = utcDayNumber(checkin);
  const checkoutMs = utcDayNumber(checkout);
  const today = now.toISOString().slice(0, 10);
  const nights = Math.round((checkoutMs - checkinMs) / 86_400_000);
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs) || nights < 1 || nights > 90) {
    return null;
  }
  if (checkin < today) return null;

  const travelers = Math.min(30, Math.max(1, Math.round(Number(context.travelers) || 1)));
  const explicitRooms = explicitRoomCount(context.query);
  const rooms = explicitRooms
    ? Math.min(travelers, Math.max(1, Math.round(explicitRooms)))
    : Math.max(1, Math.ceil(travelers / 2));

  return {
    checkin,
    checkout,
    nights,
    travelers,
    rooms,
    occupancyAssumed: explicitRooms === null,
  };
}

function bookingConfiguration(): BookingConfiguration | null {
  const token = cleanText(
    process.env.BOOKING_API_TOKEN ?? process.env.BOOKING_PARTNER_API_KEY,
    1_000,
  );
  const affiliateId = cleanText(process.env.BOOKING_AFFILIATE_ID, 80) || null;
  if (!token) return null;

  const baseUrl = (
    safeHttps(process.env.BOOKING_API_BASE_URL) ?? "https://demandapi.booking.com/3.2"
  ).replace(/\/+$/, "");
  const searchEndpoint =
    safeHttps(process.env.BOOKING_ACCOMMODATIONS_SEARCH_ENDPOINT) ??
    `${baseUrl}/accommodations/search`;
  const configuredPlatform = cleanText(process.env.BOOKING_BOOKER_PLATFORM, 20).toLowerCase();
  const platform = ["desktop", "mobile", "tablet"].includes(configuredPlatform)
    ? (configuredPlatform as BookingConfiguration["platform"])
    : "mobile";
  const bookerCountry = /^[a-z]{2}$/i.test(cleanText(process.env.BOOKING_BOOKER_COUNTRY, 2))
    ? cleanText(process.env.BOOKING_BOOKER_COUNTRY, 2).toLowerCase()
    : "fr";

  return { token, affiliateId, baseUrl, searchEndpoint, bookerCountry, platform };
}

async function fetchBookingJson(
  configuration: BookingConfiguration,
  url: string,
  body: JsonRecord,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BOOKING_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuration.token}`,
        ...(configuration.affiliateId ? { "X-Affiliate-Id": configuration.affiliateId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Booking Demand API ${response.status}`);
    return (await response.json()) as JsonRecord;
  } finally {
    clearTimeout(timeout);
  }
}

function bookingSearchBody(
  configuration: BookingConfiguration,
  stay: HotelStay,
  latitude: number,
  longitude: number,
  strictQuality: boolean,
): JsonRecord {
  const radius = Math.min(
    50,
    Math.max(2, Math.round(Number(process.env.BOOKING_SEARCH_RADIUS_KM) || 18)),
  );
  return {
    booker: { country: configuration.bookerCountry, platform: configuration.platform },
    checkin: stay.checkin,
    checkout: stay.checkout,
    currency: "EUR",
    coordinates: { latitude, longitude, radius },
    guests: {
      number_of_adults: stay.travelers,
      number_of_rooms: stay.rooms,
    },
    extras: ["extra_charges", "products"],
    rows: MAX_BOOKING_RESULTS,
    ...(strictQuality
      ? {
          accommodation_types: [204, 206],
          rating: { minimum_review_score: 7 },
          sort: { by: "review_score", direction: "descending" },
        }
      : {}),
  };
}

function searchRowId(row: JsonRecord) {
  const value = getPath(row, "id") ?? getPath(row, "accommodation_id");
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : cleanText(value, 80) || null;
}

function bookingSearchUrl(name: string, context: TravelPriceSearchContext, stay: HotelStay) {
  const url = new URL("https://www.booking.com/searchresults.fr.html");
  url.searchParams.set("ss", [name, context.city, context.country].filter(Boolean).join(", "));
  url.searchParams.set("checkin", stay.checkin);
  url.searchParams.set("checkout", stay.checkout);
  url.searchParams.set("group_adults", String(stay.travelers));
  url.searchParams.set("no_rooms", String(stay.rooms));
  url.searchParams.set("group_children", "0");
  return url.toString();
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function parseBookingHotelSource(
  input: BookingHotelParseInput,
  context: TravelPriceSearchContext,
): TravelPriceSource | null {
  const { searchRow, detailsRow, stay, checkedAt } = input;
  const name = firstString(detailsRow ?? searchRow, [
    "name",
    "hotel_name",
    "accommodation.name",
    "display_name",
  ]);
  if (!name) return null;

  const totalPrice = firstNumber(searchRow, [
    "price.total.booker_currency",
    "price.total",
    "price.book.booker_currency",
    "price.book",
    "price.display.booker_currency",
    "price.display",
    "products.0.price.total.booker_currency",
    "products.0.price.total",
    "products.0.price.book.booker_currency",
    "products.0.price.book",
  ]);
  const currency =
    firstString(searchRow, [
      "currency.booker",
      "currency.booker_currency",
      "currency",
      "price.currency",
      "products.0.currency",
    ]).toUpperCase() || "EUR";
  const rating = firstNumber(detailsRow ?? searchRow, [
    "rating.review_score",
    "review_score",
    "rating.score",
    "rating",
  ]);
  const reviewsCount = firstNumber(detailsRow ?? searchRow, [
    "rating.number_of_reviews",
    "number_of_reviews",
    "review_count",
    "reviews_count",
  ]);
  const stars = firstNumber(detailsRow ?? searchRow, ["rating.stars", "stars", "class"]);
  const pricePerNight =
    totalPrice !== null && totalPrice > 0
      ? Math.round((totalPrice / stay.nights) * 100) / 100
      : null;
  const hotelUrl =
    firstHttps(searchRow, ["url.web", "url", "web_url", "booking_url"]) ??
    firstHttps(detailsRow, ["url.web", "url", "web_url"]);
  const sourceUrl = hotelUrl ?? bookingSearchUrl(name, context, stay);
  const address = firstString(detailsRow, [
    "location.address.fr",
    "location.address.en-gb",
    "location.address",
    "address",
  ]);
  const hasLivePrice = totalPrice !== null && totalPrice > 0;
  const evidence: VerifiedHotelEvidence = {
    name,
    livePrice: hasLivePrice,
    checkin: stay.checkin,
    checkout: stay.checkout,
    nights: stay.nights,
    travelers: stay.travelers,
    rooms: stay.rooms,
    occupancyAssumed: stay.occupancyAssumed,
    totalPrice: hasLivePrice ? Math.round(totalPrice * 100) / 100 : null,
    pricePerNight,
    currency,
    rating,
    reviewsCount,
    stars,
    checkedAt,
  };

  const snippet = [
    `Établissement Booking.com disponible du ${stay.checkin} au ${stay.checkout}`,
    `${stay.nights} nuit${stay.nights > 1 ? "s" : ""}`,
    `${stay.travelers} adulte${stay.travelers > 1 ? "s" : ""}`,
    `${stay.rooms} chambre${stay.rooms > 1 ? "s" : ""}${stay.occupancyAssumed ? " (hypothèse IA+)" : " (demandée)"}`,
    hasLivePrice
      ? `tarif daté ${formatMoney(totalPrice, currency)} total du séjour, soit ${formatMoney(pricePerNight!, currency)} par nuit`
      : "prix non fourni par la réponse API",
    rating !== null ? `note ${rating.toFixed(1)}/10` : "",
    reviewsCount !== null ? `${Math.round(reviewsCount).toLocaleString("fr-FR")} avis` : "",
    stars !== null ? `${stars} étoile${stars > 1 ? "s" : ""}` : "",
    address,
    `vérifié le ${checkedAt}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: name,
    url: sourceUrl,
    snippet,
    category: "hotel",
    authority: "booking_api",
    priceUsable: hasLivePrice,
    hotel: evidence,
  };
}

function hotelQualityScore(source: TravelPriceSource) {
  const hotel = source.hotel;
  const authority =
    source.authority === "booking_api" ? 1_000 : source.authority === "google_places" ? 700 : 500;
  const rating = Number(hotel?.rating) || 0;
  const reviews = Math.max(0, Number(hotel?.reviewsCount) || 0);
  const stars = Number(hotel?.stars) || 0;
  const pricePenalty = Math.min(20, Math.max(0, Number(hotel?.pricePerNight) || 0) / 100);
  return authority + rating * 20 + Math.log10(reviews + 1) * 12 + stars * 4 - pricePenalty;
}

function hotelValueScore(source: TravelPriceSource) {
  const rating = Math.max(0, Number(source.hotel?.rating) || 0);
  const reviews = Math.max(0, Number(source.hotel?.reviewsCount) || 0);
  const price = Math.max(1, Number(source.hotel?.pricePerNight) || Number.POSITIVE_INFINITY);
  if (!Number.isFinite(price)) return 0;
  const confidence = 1 + Math.min(0.35, Math.log10(reviews + 1) / 20);
  return (rating * confidence) / Math.sqrt(price);
}

export function selectBalancedHotelSources(
  sources: TravelPriceSource[],
  limit = MAX_HOTEL_SOURCES,
) {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const unique = new Map<string, TravelPriceSource>();
  for (const source of sources) {
    const key = normalized(source.hotel?.name || source.title);
    if (key && !unique.has(key)) unique.set(key, source);
  }
  const hotels = [...unique.values()];
  const rated = [...hotels].sort((left, right) => {
    const score = (right.hotel?.rating ?? 0) - (left.hotel?.rating ?? 0);
    if (score) return score;
    return (right.hotel?.reviewsCount ?? 0) - (left.hotel?.reviewsCount ?? 0);
  });
  const affordable = hotels
    .filter((source) => Number(source.hotel?.pricePerNight) > 0)
    .sort((left, right) => Number(left.hotel?.pricePerNight) - Number(right.hotel?.pricePerNight));
  const value = [...affordable].sort(
    (left, right) => hotelValueScore(right) - hotelValueScore(left),
  );
  const quality = [...hotels].sort(
    (left, right) => hotelQualityScore(right) - hotelQualityScore(left),
  );

  const selected = new Map<string, TravelPriceSource>();
  const add = (source: TravelPriceSource | undefined) => {
    if (!source || selected.size >= safeLimit) return;
    const key = normalized(source.hotel?.name || source.title);
    if (key && !selected.has(key)) selected.set(key, source);
  };
  for (let index = 0; index < safeLimit && selected.size < safeLimit; index += 1) {
    add(rated[index]);
    add(affordable[index]);
    add(value[index]);
  }
  for (const source of quality) add(source);
  return [...selected.values()];
}

async function fetchBookingHotelSources(context: TravelPriceSearchContext, stay: HotelStay) {
  const configuration = bookingConfiguration();
  if (!configuration || !context.city || !context.country) return [];

  const geocoded = await geocodeCityForServer({ city: context.city, country: context.country });
  let searchPayload = await fetchBookingJson(
    configuration,
    configuration.searchEndpoint,
    bookingSearchBody(configuration, stay, geocoded.lat, geocoded.lng, true),
  );
  let searchRows = dataRows(searchPayload);
  if (!searchRows.length) {
    searchPayload = await fetchBookingJson(
      configuration,
      configuration.searchEndpoint,
      bookingSearchBody(configuration, stay, geocoded.lat, geocoded.lng, false),
    );
    searchRows = dataRows(searchPayload);
  }
  if (!searchRows.length) return [];

  const ids = searchRows
    .map(searchRowId)
    .filter((id): id is string | number => id !== null)
    .slice(0, 30);
  let detailsRows: JsonRecord[] = [];
  if (ids.length) {
    try {
      const detailsPayload = await fetchBookingJson(
        configuration,
        `${configuration.baseUrl}/accommodations/details`,
        {
          accommodations: ids,
          extras: ["description", "photos", "facilities"],
          languages: ["fr", "en-gb"],
        },
      );
      detailsRows = dataRows(detailsPayload);
    } catch {
      // Search rows from some Booking partner contracts already include the
      // hotel name. Keep those live offers usable if the details call fails.
      detailsRows = [];
    }
  }

  const detailsById = new Map(
    detailsRows.flatMap((row) => {
      const id = searchRowId(row);
      return id === null ? [] : [[String(id), row] as const];
    }),
  );
  const checkedAt = new Date().toISOString();
  const parsed = searchRows.flatMap((searchRow) => {
    const id = searchRowId(searchRow);
    const source = parseBookingHotelSource(
      {
        searchRow,
        detailsRow: id === null ? null : (detailsById.get(String(id)) ?? null),
        stay,
        checkedAt,
      },
      context,
    );
    return source ? [source] : [];
  });
  const wellRated = parsed.filter((source) => (source.hotel?.rating ?? 0) >= 7.5);
  const eligible =
    wellRated.length >= 3 ? wellRated : parsed.filter((source) => (source.hotel?.rating ?? 0) >= 7);
  return selectBalancedHotelSources(eligible);
}

function candidateHotelEvidence(
  name: string,
  rating: number | null,
  reviewsCount: number | null,
  stay: HotelStay | null,
): VerifiedHotelEvidence {
  return {
    name,
    livePrice: false,
    checkin: stay?.checkin ?? null,
    checkout: stay?.checkout ?? null,
    nights: stay?.nights ?? null,
    travelers: stay?.travelers ?? 1,
    rooms: stay?.rooms ?? 1,
    occupancyAssumed: stay?.occupancyAssumed ?? true,
    totalPrice: null,
    pricePerNight: null,
    currency: null,
    rating,
    reviewsCount,
    stars: null,
    checkedAt: null,
  };
}

async function fetchGoogleHotelSources(context: TravelPriceSearchContext, stay: HotelStay | null) {
  if (!context.city && !context.country) return [];
  const rows = await fetchOfficialCatalogRows({
    kinds: ["hotel"],
    city: context.city,
    country: context.country,
    limit: 18,
  });
  return rows
    .filter((row) => row.kind === "hotel" && row.provider === "google-places")
    .flatMap((row) => {
      const url = safeHttps(row.source_url) ?? safeHttps(row.booking_url);
      const name = cleanText(row.title, 180);
      if (!url || !name) return [];
      const rating = numberValue(row.rating);
      const reviewsCount = Math.max(0, Math.trunc(numberValue(row.reviews_count) ?? 0));
      return [
        {
          title: name,
          url,
          snippet: [
            `Établissement vérifié par Google Places à ${[context.city, context.country].filter(Boolean).join(", ")}`,
            rating !== null ? `note ${rating.toFixed(1)}/5` : "",
            reviewsCount > 0 ? `${reviewsCount.toLocaleString("fr-FR")} avis` : "",
            "aucun prix daté fourni : utiliser une estimation IA+ si nécessaire",
          ]
            .filter(Boolean)
            .join(" · "),
          category: "hotel" as const,
          authority: "google_places" as const,
          priceUsable: false,
          hotel: candidateHotelEvidence(name, rating, reviewsCount, stay),
        },
      ];
    })
    .filter((source) => (source.hotel.rating ?? 5) >= 3.5)
    .sort((left, right) => hotelQualityScore(right) - hotelQualityScore(left))
    .slice(0, MAX_HOTEL_SOURCES);
}

async function fetchCatalogHotelSources(
  db: any,
  context: TravelPriceSearchContext,
  stay: HotelStay | null,
) {
  if (!db || !context.city) return [];
  let request = db
    .from("external_catalog_items")
    .select("title,provider,source_url,booking_url,rating,reviews_count,city,country,valid_until")
    .eq("kind", "hotel")
    .eq("published", true)
    .eq("admin_hidden", false)
    .in("provider", ["booking-com", "booking", "google-places"])
    .ilike("city", cleanText(context.city, 100))
    .order("rating", { ascending: false })
    .limit(18);
  if (context.country) request = request.ilike("country", cleanText(context.country, 100));
  const { data, error } = await request;
  if (error || !Array.isArray(data)) return [];

  return data.flatMap((row: any) => {
    const name = cleanText(row?.title, 180);
    const url = safeHttps(row?.source_url) ?? safeHttps(row?.booking_url);
    if (!name || !url) return [];
    const rating = numberValue(row?.rating);
    const reviewsCount = Math.max(0, Math.trunc(numberValue(row?.reviews_count) ?? 0));
    return [
      {
        title: name,
        url,
        snippet: [
          `Hôtel vérifié dans le catalogue GlobeLink pour ${[context.city, context.country].filter(Boolean).join(", ")}`,
          rating !== null ? `note ${rating.toFixed(1)}` : "",
          reviewsCount > 0 ? `${reviewsCount.toLocaleString("fr-FR")} avis` : "",
          "le catalogue ne confirme pas un tarif pour ces dates : utiliser une estimation IA+ si nécessaire",
        ]
          .filter(Boolean)
          .join(" · "),
        category: "hotel" as const,
        authority: "verified_catalog" as const,
        priceUsable: false,
        hotel: candidateHotelEvidence(name, rating, reviewsCount, stay),
      },
    ];
  });
}

export function mergeVerifiedHotelSources(sources: TravelPriceSource[]) {
  const sorted = [...sources].sort(
    (left, right) => hotelQualityScore(right) - hotelQualityScore(left),
  );
  const selected = new Map<string, TravelPriceSource>();
  for (const source of sorted) {
    const key = normalized(source.hotel?.name || source.title);
    if (!key || selected.has(key)) continue;
    selected.set(key, source);
    if (selected.size >= MAX_HOTEL_SOURCES) break;
  }
  return [...selected.values()];
}

export async function searchVerifiedHotelSources(
  context: TravelPriceSearchContext,
  db?: any,
): Promise<TravelPriceSource[]> {
  if (!context.city && !context.country) return [];
  const stay = buildHotelStay(context);
  const key = JSON.stringify({
    city: normalized(context.city),
    country: normalized(context.country),
    checkin: stay?.checkin ?? null,
    checkout: stay?.checkout ?? null,
    travelers: stay?.travelers ?? context.travelers ?? 1,
    rooms: stay?.rooms ?? null,
    booking: !!bookingConfiguration(),
  });
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.sources;

  const tasks: Array<Promise<TravelPriceSource[]>> = [
    fetchGoogleHotelSources(context, stay),
    fetchCatalogHotelSources(db, context, stay),
  ];
  if (stay && bookingConfiguration()) tasks.unshift(fetchBookingHotelSources(context, stay));

  const settled = await Promise.allSettled(tasks);
  const sources = mergeVerifiedHotelSources(
    settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  );
  resultCache.set(key, {
    expiresAt: Date.now() + HOTEL_RESULT_CACHE_TTL_MS,
    sources,
  });
  return sources;
}
