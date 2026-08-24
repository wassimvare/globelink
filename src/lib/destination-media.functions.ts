import { createServerFn } from "@tanstack/react-start";
import { destinationLandmarkTitle } from "./destination-landmarks";

type CoverInput = { titles: string[] };
export type DestinationCoverMedia = {
  /** The destination requested by the UI (not the Wikipedia page title). */
  title: string;
  landmark: string;
  url: string;
  sourceUrl: string;
  attribution: string;
  license: string | null;
  licenseUrl: string | null;
};

type AnyRecord = Record<string, any>;
type CachedCover = { expires: number; row: DestinationCoverMedia | null };
const cache = new Map<string, CachedCover>();
const TTL = 24 * 60 * 60_000;
const BATCH_SIZE = 40;

function clean(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function safeWikimedia(value: unknown) {
  try {
    const url = new URL(clean(value, 2_000));
    if (url.protocol !== "https:") return null;
    if (!/(^|\.)wikimedia\.org$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
function safeHttp(value: unknown) {
  try {
    const url = new URL(clean(value, 2_000));
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
async function json(url: string, timeoutMs = 6_500): Promise<AnyRecord | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GlobeLink/11.0.6 destination-media (+https://globelink.app)" },
    });
    if (!response.ok) return null;
    return (await response.json()) as AnyRecord;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function validate(data: CoverInput): CoverInput {
  const titles = Array.isArray(data?.titles)
    ? data.titles
        .map((value) => clean(value, 100))
        .filter(Boolean)
        .slice(0, 120)
    : [];
  return { titles: Array.from(new Set(titles)) };
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function aliasMap(query: AnyRecord) {
  const aliases = new Map<string, string>();
  for (const value of [...(query?.normalized ?? []), ...(query?.redirects ?? [])]) {
    const from = normalize(clean(value?.from, 300));
    const to = normalize(clean(value?.to, 300));
    if (from && to) aliases.set(from, to);
  }
  return aliases;
}

function resolveAlias(value: string, aliases: Map<string, string>) {
  let key = normalize(value);
  const visited = new Set<string>();
  while (aliases.has(key) && !visited.has(key)) {
    visited.add(key);
    key = aliases.get(key)!;
  }
  return key;
}

async function fetchCoverBatch(titles: string[]) {
  const requests = titles.map((title) => ({ title, landmark: destinationLandmarkTitle(title) }));
  const pageTitles = Array.from(
    new Set(requests.map((request) => request.landmark).filter(Boolean)),
  );
  if (!pageTitles.length) return [] as DestinationCoverMedia[];

  const wiki = new URL("https://fr.wikipedia.org/w/api.php");
  wiki.searchParams.set("action", "query");
  wiki.searchParams.set("format", "json");
  wiki.searchParams.set("redirects", "1");
  wiki.searchParams.set("prop", "pageimages");
  wiki.searchParams.set("piprop", "name|thumbnail|original");
  wiki.searchParams.set("pithumbsize", "1200");
  wiki.searchParams.set("titles", pageTitles.join("|"));
  const wikiJson = await json(wiki.toString());
  const query = (wikiJson?.query ?? {}) as AnyRecord;
  const aliases = aliasMap(query);
  const pages = Object.values((query?.pages ?? {}) as AnyRecord) as AnyRecord[];
  const pageByTitle = new Map(
    pages
      .filter((page) => Number(page?.pageid) > 0)
      .map((page) => [resolveAlias(clean(page?.title, 300), aliases), page]),
  );

  const candidates = requests
    .map((request) => {
      const page = pageByTitle.get(resolveAlias(request.landmark, aliases));
      const file = clean(page?.pageimage, 400);
      const url = safeWikimedia(page?.thumbnail?.source || page?.original?.source);
      return file && url ? { ...request, file, url } : null;
    })
    .filter((row): row is { title: string; landmark: string; file: string; url: string } => !!row);
  if (!candidates.length) return [] as DestinationCoverMedia[];

  // Commons supplies the author and license required for correct attribution.
  const commons = new URL("https://commons.wikimedia.org/w/api.php");
  commons.searchParams.set("action", "query");
  commons.searchParams.set("format", "json");
  commons.searchParams.set("prop", "imageinfo");
  commons.searchParams.set("iiprop", "extmetadata|descriptionurl");
  commons.searchParams.set(
    "titles",
    Array.from(new Set(candidates.map((row) => `File:${row.file}`))).join("|"),
  );
  const commonsJson = await json(commons.toString());
  const commonsPages = Object.values((commonsJson?.query?.pages ?? {}) as AnyRecord) as AnyRecord[];
  const metaByFile = new Map<string, AnyRecord>();
  for (const page of commonsPages) {
    const fileTitle = clean(page?.title, 400).replace(/^File:/i, "");
    const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
    if (fileTitle && info) metaByFile.set(normalize(fileTitle), info);
  }

  return candidates.map((row) => {
    const info = metaByFile.get(normalize(row.file)) ?? {};
    const meta = info?.extmetadata ?? {};
    const artist = clean(meta?.Artist?.value?.replace(/<[^>]+>/g, " "), 180) || "Wikimedia Commons";
    const license = clean(meta?.LicenseShortName?.value, 100) || null;
    const licenseUrl = safeHttp(meta?.LicenseUrl?.value);
    const sourceUrl =
      safeHttp(info?.descriptionurl) ||
      `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(row.file.replace(/ /g, "_"))}`;
    return {
      title: row.title,
      landmark: row.landmark,
      url: row.url,
      sourceUrl,
      attribution: artist,
      license,
      licenseUrl,
    } satisfies DestinationCoverMedia;
  });
}

export const fetchVerifiedDestinationCovers = createServerFn({ method: "POST" })
  .validator((data: CoverInput) => validate(data))
  .handler(async ({ data }) => {
    if (!data.titles.length) return [] as DestinationCoverMedia[];

    const now = Date.now();
    const missing: string[] = [];
    for (const title of data.titles) {
      const hit = cache.get(normalize(title));
      if (!hit || hit.expires <= now) missing.push(title);
    }

    // MediaWiki accepts a limited number of titles per request. Chunking removes
    // the historical 48-country ceiling while keeping only two HTTP calls per batch.
    for (const batch of chunks(missing, BATCH_SIZE)) {
      const rows = await fetchCoverBatch(batch);
      const byTitle = new Map(rows.map((row) => [normalize(row.title), row]));
      for (const title of batch) {
        cache.set(normalize(title), {
          expires: now + TTL,
          row: byTitle.get(normalize(title)) ?? null,
        });
      }
    }

    return data.titles
      .map((title) => cache.get(normalize(title))?.row ?? null)
      .filter((row): row is DestinationCoverMedia => !!row);
  });
