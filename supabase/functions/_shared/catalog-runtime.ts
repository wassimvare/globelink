// Optional self-hosted configuration, installed outside Git by the setup script.
// Managed Supabase continues to use its environment secrets.
let local: Record<string, string> = {};
try {
  local = JSON.parse(Deno.readTextFileSync(new URL("./catalog-runtime.json", import.meta.url)));
} catch { /* Environment-only deployment. */ }
export const catalogSyncSecret = Deno.env.get("CATALOG_SYNC_SECRET") || local.syncSecret || "";
export const catalogPublicUrl = local.publicUrl || Deno.env.get("SUPABASE_PUBLIC_URL") ||
  Deno.env.get("API_EXTERNAL_URL") || Deno.env.get("SUPABASE_URL") || "";

export function catalogMediaPublicUrl(path: string): string {
  const base = new URL(catalogPublicUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("SUPABASE_PUBLIC_URL must be public HTTPS");
  return `${base.origin}${base.pathname.replace(/\/$/, "")}/storage/v1/object/public/catalog-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
