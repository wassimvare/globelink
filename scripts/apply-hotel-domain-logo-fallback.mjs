import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const filePath = resolve(process.cwd(), "src/lib/public-place-media.functions.ts");
let source = readFileSync(filePath, "utf8");
const original = source;

if (!source.includes("async function discoverHotelLogoByDomain(")) {
  const marker = `function validateInput(raw: PublicPlaceMediaInput): PublicPlaceMediaInput {`;
  if (!source.includes(marker)) {
    throw new Error("[Hotel domain logo] validateInput introuvable");
  }

  const helper = `const HOTEL_GENERIC_DOMAIN_WORDS = new Set([\n  "hotel",\n  "hotels",\n  "hostel",\n  "motel",\n  "resort",\n  "auberge",\n  "inn",\n]);\n\nfunction hotelCountryTlds(country: unknown) {\n  const value = normalize(country);\n  const aliases: Array<[string[], string]> = [\n    [["france", "fr"], "fr"],\n    [["suisse", "switzerland", "ch"], "ch"],\n    [["belgique", "belgium", "be"], "be"],\n    [["italie", "italy", "it"], "it"],\n    [["espagne", "spain", "es"], "es"],\n    [["portugal", "pt"], "pt"],\n    [["allemagne", "germany", "de"], "de"],\n    [["autriche", "austria", "at"], "at"],\n    [["pays bas", "netherlands", "nl"], "nl"],\n    [["royaume uni", "united kingdom", "uk", "gb"], "co.uk"],\n    [["irlande", "ireland", "ie"], "ie"],\n    [["grece", "greece", "gr"], "gr"],\n    [["maroc", "morocco", "ma"], "ma"],\n    [["tunisie", "tunisia", "tn"], "tn"],\n    [["turquie", "turkey", "tr"], "com.tr"],\n    [["indonesie", "indonesia", "id"], "co.id"],\n    [["japon", "japan", "jp"], "jp"],\n    [["thailande", "thailand", "th"], "co.th"],\n    [["australie", "australia", "au"], "com.au"],\n    [["nouvelle zelande", "new zealand", "nz"], "co.nz"],\n    [["canada", "ca"], "ca"],\n    [["mexique", "mexico", "mx"], "com.mx"],\n    [["bresil", "brazil", "br"], "com.br"],\n    [["argentine", "argentina", "ar"], "com.ar"],\n  ];\n  const countryTld = aliases.find(([names]) => names.includes(value))?.[1] ?? null;\n  return Array.from(new Set([countryTld, "com", "fr", "net", "org"].filter(Boolean))) as string[];\n}\n\nfunction hotelDomainBases(title: unknown) {\n  const words = normalize(title)\n    .split(" ")\n    .filter(Boolean)\n    .filter((word) => !HOTEL_GENERIC_DOMAIN_WORDS.has(word));\n  if (!words.length) return [] as string[];\n  const compact = words.join("");\n  const hyphenated = words.join("-");\n  const bases = [\n    "hotel-" + compact,\n    "hotel-" + hyphenated,\n    compact,\n    hyphenated,\n  ];\n  return bases\n    .map((value) => value.replace(/^-+|-+$/g, "").slice(0, 90))\n    .filter((value, index, all) => value.length >= 4 && all.indexOf(value) === index);\n}\n\nasync function reachableLogoUrl(value: URL) {\n  if (!(await isSafePublicUrl(value))) return null;\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), 3_500);\n  try {\n    const response = await fetch(value, {\n      redirect: "follow",\n      signal: controller.signal,\n      headers: {\n        Accept: "image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.5",\n        "User-Agent": USER_AGENT,\n      },\n    });\n    if (!response.ok) return null;\n    const type = (response.headers.get("content-type") ?? "").toLowerCase();\n    if (!type.startsWith("image/") && !/\\.(ico|png|jpe?g|webp|svg)(?:$|\\?)/i.test(response.url)) return null;\n    return safeHttps(response.url);\n  } catch {\n    return null;\n  } finally {\n    clearTimeout(timer);\n  }\n}\n\nasync function logoFromDiscoveredHotelSite(\n  input: PublicPlaceMediaInput,\n  website: string,\n): Promise<PublicPlaceMediaResult | null> {\n  const start = safeWebsite(website);\n  if (!start) return null;\n  const page = await fetchOfficialPage(start);\n  if (!page) return null;\n\n  const identity = pageTitle(page.html);\n  const titleScore = similarity(input.title, identity);\n  const wantedTokens = tokens(input.title);\n  const pageTokens = new Set(tokens(identity));\n  const shared = wantedTokens.filter((token) => pageTokens.has(token)).length;\n  if (titleScore < 0.48 && shared < Math.min(2, Math.max(1, wantedTokens.length))) return null;\n\n  const finalUrl = new URL(page.finalUrl);\n  const candidates = [\n    ...officialLogoCandidates(page.html),\n    "/apple-touch-icon.png",\n    "/apple-touch-icon-precomposed.png",\n    "/favicon-512x512.png",\n    "/favicon-192x192.png",\n    "/favicon.png",\n    "/favicon.ico",\n  ];\n\n  for (const candidate of candidates.slice(0, 10)) {\n    try {\n      const resolved = new URL(candidate, finalUrl);\n      if (resolved.protocol === "http:" && finalUrl.protocol === "https:") resolved.protocol = "https:";\n      const logo = await reachableLogoUrl(resolved);\n      if (!logo) continue;\n      const host = finalUrl.hostname.replace(/^www\\./, "");\n      return {\n        url: logo,\n        source: "official-logo",\n        matchedName: identity || input.title,\n        attributions: [{ label: "Logo officiel · " + host, url: page.finalUrl }],\n      };\n    } catch {\n      continue;\n    }\n  }\n  return null;\n}\n\nasync function discoverHotelLogoByDomain(\n  input: PublicPlaceMediaInput,\n): Promise<PublicPlaceMediaResult | null> {\n  if (input.kind !== "hotel") return null;\n  const bases = hotelDomainBases(input.title);\n  const tlds = hotelCountryTlds(input.country);\n  const candidates: string[] = [];\n  for (const tld of tlds) {\n    for (const base of bases) {\n      candidates.push("https://" + base + "." + tld + "/");\n      if (candidates.length >= 14) break;\n    }\n    if (candidates.length >= 14) break;\n  }\n\n  for (let index = 0; index < candidates.length; index += 4) {\n    const batch = candidates.slice(index, index + 4);\n    const results = await Promise.all(\n      batch.map((website) => logoFromDiscoveredHotelSite(input, website)),\n    );\n    const logo = results.find(Boolean);\n    if (logo) return logo;\n  }\n  return null;\n}\n\n`;
  source = source.replace(marker, `${helper}${marker}`);
}

const oldChain = `    const value =\n      (await resolveFromNominatim(data)) ??\n      (await resolveKartaView(data)) ??\n      ({ url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult);`;
const newChain = `    const value =\n      (await resolveFromNominatim(data)) ??\n      (await discoverHotelLogoByDomain(data)) ??\n      (await resolveKartaView(data)) ??\n      ({ url: null, source: null, matchedName: null, attributions: [] } satisfies PublicPlaceMediaResult);`;
if (!source.includes(newChain)) {
  if (!source.includes(oldChain)) {
    throw new Error("[Hotel domain logo] chaîne de résolution introuvable");
  }
  source = source.replace(oldChain, newChain);
}

source = source
  .replace(/"public-place-media-v3-hotel-logo"/g, '"public-place-media-v4-domain-logo"')
  .replace(/"public-place-media-v2-kartaview"/g, '"public-place-media-v4-domain-logo"')
  .replace(/"public-place-media-v1"/g, '"public-place-media-v4-domain-logo"');

if (source !== original) writeFileSync(filePath, source, "utf8");
console.log(
  `[Hotel domain logo] public-place-media.functions.ts: ${
    source === original ? "déjà conforme" : "recherche domaine officiel activée"
  }`,
);
