import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicCatalogItem } from "./public-travel-catalog.functions";
const { upsert, blocks } = vi.hoisted(() => ({ upsert: vi.fn(async () => ({ error: null })), blocks: vi.fn(async () => ({ data: [] as { external_id: string }[], error: null })) }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => table === "external_catalog_blocks" ? { select: () => ({ eq: () => ({ in: blocks }) }) } : { upsert } } }));
import { rememberPublicCatalog } from "./catalog-persistence.server";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("SUPABASE_URL", "https://pi.example.com");
  vi.stubEnv("VITE_SUPABASE_URL", "https://pi.example.com");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
}
describe("persistent open-data catalog", () => {
  it("saves OSM identity without expiring the record or changing moderation flags", async () => {
    configure();
    const row = { id: "osm-live-node-123", provider: "openstreetmap-live", external_id: "node/123", title: "Parc", valid_until: "2026-09-23" } as PublicCatalogItem;
    await rememberPublicCatalog([row]);
    expect(upsert).toHaveBeenCalledWith([{ provider: "openstreetmap", external_id: "node/123", title: "Parc", valid_until: null }], { onConflict: "provider,external_id" });
  });
  it("never persists Google rows", async () => {
    configure();
    await rememberPublicCatalog([{ provider: "google-places", external_id: "ChIJ123" } as unknown as PublicCatalogItem]);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("does not reinsert places blocked by an administrator", async () => {
    configure(); blocks.mockResolvedValueOnce({ data: [{ external_id: "node/123" }], error: null });
    await rememberPublicCatalog([{ provider: "openstreetmap-live", external_id: "node/123" } as PublicCatalogItem]);
    expect(upsert).not.toHaveBeenCalled();
  });
  it("does not write to a stale server installation after migration", async () => {
    configure(); vi.stubEnv("SUPABASE_URL", "https://old.supabase.co");
    await rememberPublicCatalog([{ provider: "openstreetmap-live", external_id: "node/123" } as PublicCatalogItem]);
    expect(upsert).not.toHaveBeenCalled();
  });
});
