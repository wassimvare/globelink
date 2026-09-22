import type { PublicCatalogItem } from "./public-travel-catalog.functions";

// Only upstream server results enter this function; never accept browser-supplied rows.
// Google data/photos are deliberately excluded from the persistent open-data catalog.
export async function rememberPublicCatalog(rows: PublicCatalogItem[]) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) return rows;
  const publicUrl = process.env.VITE_SUPABASE_URL;
  if (publicUrl && new URL(publicUrl).origin !== new URL(process.env.SUPABASE_URL).origin) {
    console.warn("[GlobeLink catalog] Server/browser database mismatch: persistence skipped");
    return rows;
  }
  const records = rows
    .filter(
      (row) =>
        row.provider === "openstreetmap-live" && /^(node|way|relation)\/\d+$/.test(row.external_id),
    )
    .map(({ id: _id, ...row }) => ({ ...row, provider: "openstreetmap", valid_until: null }));
  if (!records.length) return rows;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      // Catalog tables are newer than the generated client schema.
      const { data: blocks, error: blockError } = await (supabaseAdmin as any)
        .from("external_catalog_blocks")
        .select("external_id")
        .eq("provider", "openstreetmap")
        .in("external_id", batch.map((row) => row.external_id));
      if (blockError) throw blockError;
      const blocked = new Set(((blocks ?? []) as { external_id: string }[]).map((row) => row.external_id));
      const allowed = batch.filter((row) => !blocked.has(row.external_id));
      if (!allowed.length) continue;
      const { error } = await (supabaseAdmin as any)
        .from("external_catalog_items")
        .upsert(allowed, { onConflict: "provider,external_id" });
      if (error) throw error;
    }
  } catch {
    console.warn("[GlobeLink catalog] Open-data persistence unavailable; returning public results");
  }
  return rows;
}
