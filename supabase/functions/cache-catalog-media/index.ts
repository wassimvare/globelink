import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type Candidate = { id: string; external_id: string; title: string; tags: Json | null };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYNC_SECRET = Deno.env.get("CATALOG_SYNC_SECRET") ?? "";
const USER_AGENT = "GlobeLink/12.0 (+https://github.com/wassimvare/globelink)";
const BUCKET = "catalog-media";
const MAX_BYTES = 8 * 1024 * 1024;
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase server secrets are missing");
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function clean(value: unknown, max = 1000) {
  return String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function decodeHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
function meta(metadata: Json, key: string) {
  return clean(record(metadata[key]).value, 1200);
}
function isAllowedLicense(value: string) {
  const license = value.trim();
  if (/public domain/i.test(license)) return true;
  if (/^cc0(?:\s|$)/i.test(license)) return true;
  if (/^cc(?:-|\s)by(?:-sa)?(?:-|\s|$)/i.test(license)) return true;
  if (/creative commons attribution(?:-share alike)?/i.test(license)) return true;
  return false;
}
function mime(value: unknown): "image/jpeg" | "image/png" | "image/webp" | null {
  const parsed = clean(value, 100).toLowerCase().split(";")[0];
  if (parsed === "image/jpeg" || parsed === "image/png" || parsed === "image/webp") return parsed;
  return null;
}
function ext(contentType: string) {
  return contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
}
function commonsFilename(value: unknown) {
  const raw = clean(value, 1000);
  if (!raw || /^Category:/i.test(raw)) return null;
  let name = raw;
  try {
    if (/^https:\/\//i.test(raw)) {
      const url = new URL(raw);
      if (url.hostname === "commons.wikimedia.org") name = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ""));
      else if (url.hostname === "upload.wikimedia.org") name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      else return null;
    }
  } catch { return null; }
  name = name.replace(/^File:/i, "").trim();
  return name && !/^Category:/i.test(name) ? name : null;
}
async function fixedJson(url: URL) {
  const allowed = new Set(["commons.wikimedia.org", "www.wikidata.org"]);
  if (url.protocol !== "https:" || !allowed.has(url.hostname)) throw new Error("blocked-upstream-host");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
    if (!response.ok) throw new Error(`upstream-${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function fileFromWikidata(id: string) {
  if (!/^Q\d+$/i.test(id)) return null;
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetclaims");
  url.searchParams.set("entity", id.toUpperCase());
  url.searchParams.set("property", "P18");
  url.searchParams.set("format", "json");
  const json = record(await fixedJson(url));
  const claims = record(json.claims);
  const rows = Array.isArray(claims.P18) ? claims.P18 as Json[] : [];
  const value = record(record(rows[0]?.mainsnak).datavalue).value;
  return commonsFilename(value);
}
async function chooseFile(tags: Json) {
  const direct = commonsFilename(tags.wikimedia_commons ?? tags.commons);
  if (direct) return direct;
  const wikidata = clean(tags.wikidata, 80);
  return wikidata ? await fileFromWikidata(wikidata) : null;
}
async function commonsInfo(fileName: string) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("iiurlwidth", "1600");
  url.searchParams.set("iiextmetadatafilter", "LicenseShortName|LicenseUrl|Artist|Credit");
  url.searchParams.set("titles", `File:${fileName}`);
  const json = record(await fixedJson(url));
  const pages = record(record(json.query).pages);
  const page = Object.values(pages)[0] as Json | undefined;
  const infos = page && Array.isArray(page.imageinfo) ? page.imageinfo as Json[] : [];
  const info = infos[0];
  if (!info) return null;
  const metadata = record(info.extmetadata);
  const license = decodeHtml(meta(metadata, "LicenseShortName"));
  if (!isAllowedLicense(license)) return null;
  const imageUrl = clean(info.thumburl ?? info.url, 2500);
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "upload.wikimedia.org") throw new Error("blocked-image-host");
  const contentType = mime(info.thumbmime ?? info.mime);
  if (!contentType) return null;
  const sourcePageUrl = clean(info.descriptionurl, 2500) || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName)}`;
  const licenseUrl = clean(meta(metadata, "LicenseUrl"), 2500) || null;
  const attribution = decodeHtml(meta(metadata, "Artist")) || decodeHtml(meta(metadata, "Credit")) || "Wikimedia Commons";
  return { fileName, imageUrl: parsed.toString(), contentType, sourcePageUrl, license, licenseUrl, attribution: clean(attribution, 600) };
}
async function sha(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function download(url: string, fallbackMime: "image/jpeg" | "image/png" | "image/webp") {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "upload.wikimedia.org") throw new Error("blocked-image-host");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(parsed, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "image/webp,image/png,image/jpeg" } });
    if (!response.ok) throw new Error(`image-${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) throw new Error("image-too-large");
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_BYTES) throw new Error("image-too-large");
    return { buffer, contentType: mime(response.headers.get("content-type")) ?? fallbackMime };
  } finally { clearTimeout(timer); }
}
async function mark(candidate: Candidate, status: string, extra: Json = {}, imageUrl?: string) {
  const now = new Date().toISOString();
  const tags = { ...record(candidate.tags), catalog_image_attempted_at: now, catalog_image_status: status, ...extra };
  const patch: Json = { tags };
  if (imageUrl) patch.image_url = imageUrl;
  const { error } = await db.from("external_catalog_items").update(patch).eq("id", candidate.id);
  if (error) throw new Error(error.message);
}
async function processOne(candidate: Candidate) {
  const tags = record(candidate.tags);
  const fileName = await chooseFile(tags);
  if (!fileName) { await mark(candidate, "no-reusable-source"); return false; }
  const info = await commonsInfo(fileName);
  if (!info) { await mark(candidate, "license-or-media-rejected", { catalog_image_candidate_file: clean(fileName, 700) }); return false; }
  const image = await download(info.imageUrl, info.contentType);
  const fingerprint = (await sha(`${candidate.external_id}|${info.fileName}`)).slice(0, 32);
  const safeId = candidate.external_id.replace(/[^a-zA-Z0-9/_-]+/g, "-");
  const path = `openstreetmap/${safeId}/${fingerprint}.${ext(image.contentType)}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, image.buffer, { contentType: image.contentType, cacheControl: "31536000", upsert: true });
  if (uploadError) throw new Error(uploadError.message);
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = clean(data.publicUrl, 2500);
  if (!publicUrl.startsWith("https://")) throw new Error("invalid-public-url");
  await mark(candidate, "cached", {
    catalog_image_storage_path: path,
    catalog_image_source: "wikimedia-commons",
    catalog_image_source_url: info.sourcePageUrl,
    catalog_image_license: info.license,
    catalog_image_license_url: info.licenseUrl,
    catalog_image_attribution: info.attribution,
    catalog_image_cached_at: new Date().toISOString(),
  }, publicUrl);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: HEADERS });
  if (!SYNC_SECRET || req.headers.get("x-catalog-sync-secret") !== SYNC_SECRET) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: HEADERS });
  let limit = 60;
  try { const body = record(await req.json()); limit = Math.min(150, Math.max(1, Math.trunc(Number(body.limit ?? 60)) || 60)); } catch { /* default */ }
  const { data, error } = await db.rpc("get_catalog_media_candidates", { p_limit: limit });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: HEADERS });
  const candidates = (data ?? []) as Candidate[];
  let cached = 0, skipped = 0, failed = 0;
  const errors: Json[] = [];
  for (const candidate of candidates) {
    try { if (await processOne(candidate)) cached += 1; else skipped += 1; }
    catch (error) {
      failed += 1;
      const message = clean(error instanceof Error ? error.message : error, 300) || "unknown-error";
      errors.push({ id: candidate.id, title: clean(candidate.title, 180), message });
      try { await mark(candidate, "error", { catalog_image_error: message }); } catch { /* continue */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return new Response(JSON.stringify({ ok: failed === 0 || cached > 0, processed: candidates.length, cached, skipped, failed, errors: errors.slice(0, 20), googlePlacesStored: false }), { status: failed > 0 && cached === 0 ? 502 : 200, headers: HEADERS });
});
