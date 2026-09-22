// Rebuild public URLs from the active installation, including after a migration.
// Never trust an arbitrary image host supplied by an upstream place record.
export function cachedCatalogImage(
  item: { tags?: Record<string, unknown> | null },
  baseUrl = import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : "") ||
    "https://hzsfocphpynxoykfkfaj.supabase.co",
): string | null {
  const tags = item.tags ?? {};
  const path = tags.catalog_image_storage_path;
  if (tags.catalog_image_status !== "cached" || tags.catalog_image_source !== "wikimedia-commons")
    return null;
  if (
    typeof path !== "string" ||
    !path.startsWith("openstreetmap/") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /[\\\\?#%\u0000-\u001f]/.test(path)
  )
    return null;
  const license = String(tags.catalog_image_license ?? "");
  if (
    !/^(CC(?:-|\s)BY(?:-SA)?(?:[ -]\d|$)|CC0(?:\s|$)|Public domain|Creative Commons Attribution(?:-Share Alike)?(?:[ -]\d|$))/i.test(
      license,
    )
  )
    return null;
  try {
    const source = new URL(String(tags.catalog_image_source_url ?? ""));
    const base = new URL(baseUrl);
    if (source.protocol !== "https:" || source.hostname !== "commons.wikimedia.org") return null;
    if (base.protocol !== "https:" || base.username || base.password) return null;
    return `${base.origin}${base.pathname.replace(/\/$/, "")}/storage/v1/object/public/catalog-media/${path.split("/").map(encodeURIComponent).join("/")}`;
  } catch {
    return null;
  }
}
