import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/lib/public-place-media.functions.ts");
let source = readFileSync(filePath, "utf8");
const original = source;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`[Hotel logo fallback] Motif introuvable: ${label}`);
  }
  source = source.replace(before, after);
}

source = source.replace(
  `source: "official-site" | "osm-wikimedia" | "wikidata" | "wikipedia" | "kartaview" | null;`,
  `source: "official-site" | "official-logo" | "osm-wikimedia" | "wikidata" | "wikidata-logo" | "wikipedia" | "kartaview" | null;`,
);

if (!source.includes("async function officialWebsiteLogo(")) {
  const marker = `function validateInput(raw: PublicPlaceMediaInput): PublicPlaceMediaInput {`;
  if (!source.includes(marker)) {
    throw new Error("[Hotel logo fallback] validateInput introuvable");
  }

  const helper = `function htmlAttribute(tag: string, name: string) {\n  const escaped = name.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");\n  const patterns = [\n    new RegExp(escaped + "\\\\s*=\\\\s*[\\\"']([^\\\"']+)[\\\"']", "i"),\n    new RegExp(escaped + "\\\\s*=\\\\s*([^\\\\s>]+)", "i"),\n  ];\n  for (const pattern of patterns) {\n    const match = tag.match(pattern);\n    if (match?.[1]) return htmlEntityDecode(match[1].trim());\n  }\n  return null;\n}\n\nfunction officialLogoCandidates(html: string) {\n  const weighted: Array<{ url: string; weight: number }> = [];\n  const push = (value: string | null | undefined, weight: number) => {\n    const url = clean(value, 2500).replace(/\\\\\\\//g, "/");\n    if (url) weighted.push({ url, weight });\n  };\n\n  for (const tag of html.match(/<link\\b[^>]*>/gi) ?? []) {\n    const rel = clean(htmlAttribute(tag, "rel"), 160).toLowerCase();\n    const href = htmlAttribute(tag, "href");\n    if (!href || !rel) continue;\n    if (rel.includes("apple-touch-icon")) push(href, 100);\n    else if (rel.includes("mask-icon")) push(href, 90);\n    else if (rel.includes("icon")) {\n      const sizes = clean(htmlAttribute(tag, "sizes"), 80);\n      const numeric = Number(sizes.match(/(\\d{2,4})x\\d{2,4}/i)?.[1] ?? 0);\n      push(href, 70 + Math.min(20, numeric / 32));\n    }\n  }\n\n  const jsonLogoPatterns = [\n    /[\"']logo[\"']\\s*:\\s*[\"']([^\"']+)[\"']/gi,\n    /[\"']logo[\"']\\s*:\\s*\\{[^}]*[\"'](?:url|contentUrl)[\"']\\s*:\\s*[\"']([^\"']+)[\"']/gi,\n  ];\n  for (const pattern of jsonLogoPatterns) {\n    let match: RegExpExecArray | null = null;\n    while ((match = pattern.exec(html))) push(match[1], 120);\n  }\n\n  push(metaValue(html, "og:logo"), 115);\n  return weighted\n    .sort((left, right) => right.weight - left.weight)\n    .map((entry) => entry.url)\n    .filter((value, index, all) => all.indexOf(value) === index);\n}\n\nasync function officialWebsiteLogo(\n  input: PublicPlaceMediaInput,\n  website: unknown,\n): Promise<PublicPlaceMediaResult | null> {\n  if (input.kind !== "hotel") return null;\n  const url = safeWebsite(website);\n  if (!url) return null;\n  const page = await fetchOfficialPage(url);\n  if (!page) return null;\n\n  const identity = pageTitle(page.html);\n  const match = similarity(input.title, identity);\n  const placeTokens = tokens(input.title);\n  const identityTokens = new Set(tokens(identity));\n  const shared = placeTokens.filter((token) => identityTokens.has(token)).length;\n  if (match < 0.45 && shared < Math.min(1, Math.max(1, placeTokens.length))) return null;\n\n  for (const candidate of officialLogoCandidates(page.html)) {\n    try {\n      const resolved = new URL(candidate, page.finalUrl);\n      if (resolved.protocol === "http:" && new URL(page.finalUrl).protocol === "https:") {\n        resolved.protocol = "https:";\n      }\n      const logo = safeHttps(resolved.toString());\n      if (!logo) continue;\n      const host = new URL(page.finalUrl).hostname.replace(/^www\\./, "");\n      return {\n        url: logo,\n        source: "official-logo",\n        matchedName: identity || input.title,\n        attributions: [{ label: \`Logo officiel · \${host}\`, url: page.finalUrl }],\n      };\n    } catch {\n      continue;\n    }\n  }\n  return null;\n}\n\nasync function wikidataLogo(id: string): Promise<PublicPlaceMediaResult | null> {\n  if (!/^Q\\d+$/i.test(id)) return null;\n  const url = new URL("https://www.wikidata.org/w/api.php");\n  url.searchParams.set("action", "wbgetclaims");\n  url.searchParams.set("entity", id.toUpperCase());\n  url.searchParams.set("property", "P154");\n  url.searchParams.set("format", "json");\n  const json = (await fetchJson(url.toString())) as AnyRecord | null;\n  const claims = json?.claims as AnyRecord | undefined;\n  const rows = Array.isArray(claims?.P154) ? (claims.P154 as AnyRecord[]) : [];\n  const file = clean(\n    ((((rows[0]?.mainsnak as AnyRecord | undefined)?.datavalue as AnyRecord | undefined)?.value)),\n    700,\n  );\n  const image = commonsFileUrl(file);\n  if (!image) return null;\n  return {\n    url: image,\n    source: "wikidata-logo",\n    matchedName: null,\n    attributions: [\n      { label: "Logo officiel · Wikidata/Wikimedia", url: \`https://www.wikidata.org/wiki/\${id.toUpperCase()}\` },\n    ],\n  };\n}\n\n`;

  source = source.replace(marker, `${helper}${marker}`);
}

replaceRequired(
  `  const website = extra.website || extra["contact:website"] || extra.url || extra["contact:url"];\n  const official = await officialWebsitePhoto(input, website);\n  if (official) return official;\n  return null;\n}`,
  `  const website = extra.website || extra["contact:website"] || extra.url || extra["contact:url"];\n  const official = await officialWebsitePhoto(input, website);\n  if (official) return official;\n\n  if (input.kind === "hotel") {\n    const officialLogo = await officialWebsiteLogo(input, website);\n    if (officialLogo) return officialLogo;\n\n    const brandWikidata = clean(\n      extra["brand:wikidata"] || extra["operator:wikidata"] || extra["network:wikidata"],\n      50,\n    );\n    if (brandWikidata) {\n      const brandLogo = await wikidataLogo(brandWikidata);\n      if (brandLogo) return { ...brandLogo, matchedName: best.name || input.title };\n    }\n  }\n  return null;\n}`,
  "logo officiel avant KartaView",
);

source = source
  .replace(/"public-place-media-v2-kartaview"/g, '"public-place-media-v3-hotel-logo"')
  .replace(/"public-place-media-v1"/g, '"public-place-media-v3-hotel-logo"');

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Hotel logo fallback] public-place-media.functions.ts: ${
    source === original ? "déjà conforme" : "logo officiel hôtel activé"
  }`,
);
