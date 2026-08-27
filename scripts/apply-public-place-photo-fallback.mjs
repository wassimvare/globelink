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

// Invalidate every old "no image" answer. v9 adds a named OpenStreetMap/Nominatim
// lookup so commercial places with no Wikidata photo can still resolve their real
// official website and its own og:image without inventing a generic image.
source = source
  .replace(/verified-place-media-v7-strict-official/g, "verified-place-media-v9-osm-name-official")
  .replace(/verified-place-media-v8-public-verified/g, "verified-place-media-v9-osm-name-official");

// Reverse geocoding may land on the surrounding building/road. Still reuse any
// official media metadata when the exact reverse result carries it.
replaceRequired(
  `  const wikipedia = cleanText(extra.wikipedia, 300);\n  if (wikipedia) {\n    const result = await wikipediaImage(wikipedia);\n    if (result) return result;\n  }\n  return null;\n}`,
  `  const wikipedia = cleanText(extra.wikipedia, 300);\n  if (wikipedia) {\n    const result = await wikipediaImage(wikipedia);\n    if (result) return result;\n  }\n\n  if (!input.skipOfficialSite) {\n    const website = safeWebsite(\n      extra.website || extra["contact:website"] || extra.url || extra["contact:url"],\n    );\n    if (website) {\n      const official = await resolveOfficialWebsiteImage(input, website);\n      if (official) return official;\n    }\n  }\n  return null;\n}`,
  "site officiel depuis Nominatim reverse",
);

// Search Nominatim by the establishment name as well as coordinates. This fixes
// cases such as chain hotels where the map point is real but the reverse lookup
// returns only the containing building and therefore misses website/image tags.
if (!source.includes("async function resolveFromNominatimNamedSearch(")) {
  const marker = `async function resolveWikidataSearch(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {`;
  if (!source.includes(marker)) {
    throw new Error("[Public place photo] insertion Nominatim nommée impossible");
  }
  const helper = `async function resolveFromNominatimNamedSearch(\n  input: PlaceMediaInput,\n): Promise<ResolvedPlaceMedia | null> {\n  const query = [input.title, input.city, input.country].filter(Boolean).join(\", \" ).trim();\n  if (!query) return null;\n\n  const url = new URL(\"https://nominatim.openstreetmap.org/search\");\n  url.searchParams.set(\"format\", \"jsonv2\");\n  url.searchParams.set(\"q\", query.slice(0, 280));\n  url.searchParams.set(\"limit\", \"8\");\n  url.searchParams.set(\"addressdetails\", \"1\");\n  url.searchParams.set(\"extratags\", \"1\");\n  url.searchParams.set(\"namedetails\", \"1\");\n  if (input.latitude != null && input.longitude != null) {\n    const lat = input.latitude;\n    const lng = input.longitude;\n    url.searchParams.set(\"viewbox\", \`\${(lng - 0.035).toFixed(6)},\${(lat + 0.025).toFixed(6)},\${(lng + 0.035).toFixed(6)},\${(lat - 0.025).toFixed(6)}\`);\n    url.searchParams.set(\"bounded\", \"0\");\n  }\n\n  const json = await fetchJson(\n    url.toString(),\n    { headers: { \"Accept-Language\": \"fr,en;q=0.8\" } },\n    6_000,\n  );\n  const results = Array.isArray(json) ? (json as unknown as AnyRecord[]) : [];\n  let best: { row: AnyRecord; score: number; name: string } | null = null;\n\n  for (const row of results) {\n    const namedetails =\n      row.namedetails && typeof row.namedetails === \"object\"\n        ? (row.namedetails as AnyRecord)\n        : {};\n    const displayName = cleanText(row.display_name, 500);\n    const candidateName =\n      cleanText(row.name, 240) ||\n      cleanText(namedetails.name, 240) ||\n      cleanText(namedetails[\"name:fr\"], 240) ||\n      displayName.split(\",\")[0]?.trim() ||\n      \"\";\n    const similarity = Math.max(\n      nameSimilarity(input.title, candidateName),\n      nameSimilarity(input.title, displayName),\n    );\n    if (similarity < 0.58) continue;\n\n    const lat = Number(row.lat);\n    const lng = Number(row.lon);\n    let distance = 0;\n    if (\n      input.latitude != null &&\n      input.longitude != null &&\n      Number.isFinite(lat) &&\n      Number.isFinite(lng)\n    ) {\n      distance = haversineKm(input.latitude, input.longitude, lat, lng);\n      if (distance > 4) continue;\n    }\n    const score = similarity * 100 - distance * 10;\n    if (!best || score > best.score) best = { row, score, name: candidateName };\n  }\n\n  if (!best) return null;\n  const extra =\n    best.row.extratags && typeof best.row.extratags === \"object\"\n      ? (best.row.extratags as AnyRecord)\n      : {};\n\n  const direct = safeHttps(extra.image) ?? commonsFileUrl(extra.wikimedia_commons);\n  if (direct) {\n    return {\n      url: direct,\n      source: \"wikimedia\",\n      matchedName: best.name || input.title,\n      attributions: [{ label: \"OpenStreetMap / Wikimedia\", url: \"https://www.openstreetmap.org\" }],\n    };\n  }\n\n  const wikidata = cleanText(extra.wikidata, 40);\n  if (wikidata) {\n    const media = await wikidataImage(wikidata);\n    if (media) return { ...media, matchedName: best.name || media.matchedName };\n  }\n\n  const wikipedia = cleanText(extra.wikipedia, 300);\n  if (wikipedia) {\n    const media = await wikipediaImage(wikipedia);\n    if (media) return { ...media, matchedName: best.name || media.matchedName };\n  }\n\n  if (!input.skipOfficialSite) {\n    const website = safeWebsite(\n      extra.website || extra[\"contact:website\"] || extra.url || extra[\"contact:url\"],\n    );\n    if (website) {\n      const official = await resolveOfficialWebsiteImage(\n        { ...input, website, address: input.address || cleanText(best.row.display_name, 420) },\n        website,\n      );\n      if (official) return { ...official, matchedName: best.name || input.title };\n    }\n  }\n\n  return null;\n}\n\n`;
  source = source.replace(marker, `${helper}${marker}`);
}

if (!source.includes("async function resolveWikimediaNameSearch(")) {
  const marker = `async function resolveWikidataSearch(input: PlaceMediaInput): Promise<ResolvedPlaceMedia | null> {`;
  if (!source.includes(marker)) {
    throw new Error("[Public place photo] insertion recherche Wikimedia impossible");
  }
  const helper = `async function resolveWikimediaNameSearch(\n  input: PlaceMediaInput,\n): Promise<ResolvedPlaceMedia | null> {\n  const query =\n    \`\"\${input.title.replace(/\"/g, \"\")}\" \${[input.city, input.country].filter(Boolean).join(\" \")}\`.trim();\n  if (!query) return null;\n\n  const url = new URL(\"https://commons.wikimedia.org/w/api.php\");\n  url.searchParams.set(\"action\", \"query\");\n  url.searchParams.set(\"generator\", \"search\");\n  url.searchParams.set(\"gsrsearch\", query.slice(0, 220));\n  url.searchParams.set(\"gsrnamespace\", \"6\");\n  url.searchParams.set(\"gsrlimit\", \"12\");\n  url.searchParams.set(\"prop\", \"imageinfo\");\n  url.searchParams.set(\"iiprop\", \"url|extmetadata\");\n  url.searchParams.set(\"iiurlwidth\", \"1600\");\n  url.searchParams.set(\"format\", \"json\");\n  url.searchParams.set(\"origin\", \"*\");\n\n  const json = await fetchJson(url.toString(), {}, 6_000);\n  const queryData = json?.query as AnyRecord | undefined;\n  const pages =\n    queryData?.pages && typeof queryData.pages === \"object\"\n      ? (Object.values(queryData.pages as AnyRecord) as AnyRecord[])\n      : [];\n  let best: { page: AnyRecord; image: string; score: number; title: string } | null = null;\n  const placeTokens = significantTokens(input.title);\n  const city = normalize(input.city ?? \"\");\n\n  for (const page of pages) {\n    const fileTitle = cleanText(page.title, 320).replace(/^File:/i, \"\");\n    const imageInfo = Array.isArray(page.imageinfo) ? (page.imageinfo[0] as AnyRecord | undefined) : undefined;\n    if (!imageInfo) continue;\n    const metadata =\n      imageInfo.extmetadata && typeof imageInfo.extmetadata === \"object\"\n        ? (imageInfo.extmetadata as AnyRecord)\n        : {};\n    const metadataValue = (key: string) => {\n      const entry = metadata[key] as AnyRecord | undefined;\n      return cleanText(entry?.value, 700);\n    };\n    const searchable = [\n      fileTitle,\n      metadataValue(\"ObjectName\"),\n      metadataValue(\"ImageDescription\"),\n      metadataValue(\"Categories\"),\n    ]\n      .filter(Boolean)\n      .join(\" \" );\n    const similarity = nameSimilarity(input.title, searchable);\n    const searchTokens = new Set(significantTokens(searchable));\n    const matched = placeTokens.filter((token) => searchTokens.has(token)).length;\n    const citySeen = !city || normalize(searchable).includes(city);\n    if (similarity < 0.72) continue;\n    if (placeTokens.length >= 2 && matched < Math.min(2, placeTokens.length)) continue;\n    if (!citySeen && similarity < 0.9) continue;\n    const image = safeHttps(imageInfo.thumburl) ?? safeHttps(imageInfo.url);\n    if (!image) continue;\n    const score = similarity * 100 + (citySeen ? 8 : 0) + matched * 4;\n    if (!best || score > best.score) best = { page, image, score, title: fileTitle };\n  }\n\n  if (!best) return null;\n  const commonsTitle = cleanText(best.page.title, 400);\n  return {\n    url: best.image,\n    source: \"wikimedia\",\n    matchedName: best.title || input.title,\n    attributions: [\n      {\n        label: \"Wikimedia Commons\",\n        url: commonsTitle\n          ? \`https://commons.wikimedia.org/wiki/\${encodeURIComponent(commonsTitle.replace(/ /g, \"_\"))}\`\n          : \"https://commons.wikimedia.org/\",\n      },\n    ],\n  };\n}\n\n`;
  source = source.replace(marker, `${helper}${marker}`);
}

// Named OSM lookup now runs before the lower-confidence Wikidata/Openverse searches.
replaceRequired(
  `    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const wikimediaNameSearch = await resolveWikimediaNameSearch(data);`,
  `    const nominatimNamed = await resolveFromNominatimNamedSearch(data);\n    if (nominatimNamed) return nominatimNamed;\n\n    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const wikimediaNameSearch = await resolveWikimediaNameSearch(data);`,
  "Nominatim nommée avant Wikidata",
);

// First-time build from the unpatched source has no Wikimedia-name call yet.
if (!source.includes("const wikimediaNameSearch = await resolveWikimediaNameSearch(data);")) {
  replaceRequired(
    `    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const openverse = await resolveOpenverse(data);`,
    `    const nominatimNamed = await resolveFromNominatimNamedSearch(data);\n    if (nominatimNamed) return nominatimNamed;\n\n    const wikidataSearch = await resolveWikidataSearch(data);\n    if (wikidataSearch) return wikidataSearch;\n\n    const wikimediaNameSearch = await resolveWikimediaNameSearch(data);\n    if (wikimediaNameSearch) return wikimediaNameSearch;\n\n    const openverse = await resolveOpenverse(data);`,
    "fallbacks nommés publics",
  );
}

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Public place photo] place-media.functions.ts: ${source === original ? "déjà conforme" : "mis à jour"} (Nominatim nommée + site officiel + Wikimedia)`,
);
