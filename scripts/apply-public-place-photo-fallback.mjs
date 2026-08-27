import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/lib/place-media.functions.ts");
let source = readFileSync(filePath, "utf8");
const original = source;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[Public place photo] Motif introuvable: ${label}`);
  }
  source = source.replace(before, after);
}

// Invalidate cached "no image" answers from the previous strict Booking-only phase.
source = source.replace(
  /verified-place-media-v7-strict-official/g,
  "verified-place-media-v8-public-verified",
);

// Nominatim can expose the establishment's official website even when the original
// catalog row did not contain it. Reuse the existing guarded official-site scraper.
replaceRequired(
  `  const wikipedia = cleanText(extra.wikipedia, 300);\n  if (wikipedia) {\n    const result = await wikipediaImage(wikipedia);\n    if (result) return result;\n  }\n  return null;\n}`,
  `  const wikipedia = cleanText(extra.wikipedia, 300);\n  if (wikipedia) {\n    const result = await wikipediaImage(wikipedia);\n    if (result) return result;\n  }\n\n  if (!input.skipOfficialSite) {\n    const website = safeWebsite(\n      extra.website || extra["contact:website"] || extra.url || extra["contact:url"],\n    );\n    if (website) {\n      const official = await resolveOfficialWebsiteImage(input, website);\n      if (official) return official;\n    }\n  }\n  return null;\n}`,
  "site officiel depuis Nominatim",
);

if (!source.includes("async function resolveWikimediaNameSearch(")) {
  const marker = `async function resolveWikidataSearch(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {`;
  if (!source.includes(marker)) {
    throw new Error("[Public place photo] insertion recherche Wikimedia impossible");
  }
  const helper = `async function resolveWikimediaNameSearch(\n  input: PlaceMediaInput,\n): Promise<ResolvedPlaceMedia | null> {\n  const query =\n    \`\"\${input.title.replace(/\"/g, \"\")}\" \${[input.city, input.country].filter(Boolean).join(\" \")}\`.trim();\n  if (!query) return null;\n\n  const url = new URL(\"https://commons.wikimedia.org/w/api.php\");\n  url.searchParams.set(\"action\", \"query\");\n  url.searchParams.set(\"generator\", \"search\");\n  url.searchParams.set(\"gsrsearch\", query.slice(0, 220));\n  url.searchParams.set(\"gsrnamespace\", \"6\");\n  url.searchParams.set(\"gsrlimit\", \"12\");\n  url.searchParams.set(\"prop\", \"imageinfo\");\n  url.searchParams.set(\"iiprop\", \"url|extmetadata\");\n  url.searchParams.set(\"iiurlwidth\", \"1600\");\n  url.searchParams.set(\"format\", \"json\");\n  url.searchParams.set(\"origin\", \"*\");\n\n  const json = await fetchJson(url.toString(), {}, 6_000);\n  const queryData = json?.query as AnyRecord | undefined;\n  const pages =\n    queryData?.pages && typeof queryData.pages === \"object\"\n      ? (Object.values(queryData.pages as AnyRecord) as AnyRecord[])\n      : [];\n  let best: { page: AnyRecord; image: string; score: number; title: string } | null = null;\n  const placeTokens = significantTokens(input.title);\n  const city = normalize(input.city ?? \"\");\n\n  for (const page of pages) {\n    const fileTitle = cleanText(page.title, 320).replace(/^File:/i, \"\");\n    const imageInfo = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as AnyRecord | undefined) : undefined;\n    if (!imageInfo) continue;\n    const metadata =\n      imageInfo.extmetadata && typeof imageInfo.extmetadata === \"object\"\n        ? (imageInfo.extmetadata as AnyRecord)\n        : {};\n    const metadataValue = (key: string) => {\n      const entry = metadata[key] as AnyRecord | undefined;\n      return cleanText(entry?.value, 700);\n    };\n    const searchable = [\n      fileTitle,\n      metadataValue(\"ObjectName\"),\n      metadataValue(\"ImageDescription\"),\n      metadataValue(\"Categories\"),\n    ]\n      .filter(Boolean)\n      .join(\" \" );\n    const similarity = nameSimilarity(input.title, searchable);\n    const searchTokens = new Set(significantTokens(searchable));\n    const matched = placeTokens.filter((token) => searchTokens.has(token)).length;\n    const citySeen = !city || normalize(searchable).includes(city);\n    if (similarity < 0.72) continue;\n    if (placeTokens.length >= 2 && matched < Math.min(2, placeTokens.length)) continue;\n    if (!citySeen && similarity < 0.9) continue;\n    const image = safeHttps(imageInfo.thumburl) ?? safeHttps(imageInfo.url);\n    if (!image) continue;\n    const score = similarity * 100 + (citySeen ? 8 : 0) + matched * 4;\n    if (!best || score > best.score) best = { page, image, score, title: fileTitle };\n  }\n\n  if (!best) return null;\n  const commonsTitle = cleanText(best.page.title, 400);\n  return {\n    url: best.image,\n    source: \"wikimedia\",\n    matchedName: best.title || input.title,\n    attributions: [\n      {\n        label: \"Wikimedia Commons\",\n        url: commonsTitle\n          ? \`https://commons.wikimedia.org/wiki/\${encodeURIComponent(commonsTitle.replace(/ /g, \"_\"))}\`\n          : \"https://commons.wikimedia.org/\",\n      },\n    ],\n  };\n}\n\n`;
  source = source.replace(marker, `${helper}${marker}`);
}

replaceRequired(
  `    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const openverse = await resolveOpenverse(data);`,
  `    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const wikimediaNameSearch = await resolveWikimediaNameSearch(data);\n    if (wikimediaNameSearch) return wikimediaNameSearch;\n\n    const openverse = await resolveOpenverse(data);`,
  "fallback Wikimedia par nom",
);

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Public place photo] place-media.functions.ts: ${source === original ? "déjà conforme" : "mis à jour"}`,
);
