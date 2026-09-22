import { describe, expect, it, vi } from "vitest";
import { loadLocalFirstDestinationCatalog } from "./destination-catalog-loader";

const rows = (kinds = ["activity", "restaurant", "hotel"]) =>
  kinds.flatMap((kind) => [0, 1, 2].map((id) => ({ id: `${kind}-${id}`, kind })));
const normalize = (items: ReturnType<typeof rows>) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
];
describe("destination local-first loading", () => {
  it("never calls public sources or Google when the database covers all categories", async () => {
    const source = vi.fn(),
      google = vi.fn();
    expect(
      await loadLocalFirstDestinationCatalog({
        cached: [],
        local: async () => rows(),
        publicSources: [source],
        google,
        normalize,
      }),
    ).toHaveLength(9);
    expect(source).not.toHaveBeenCalled();
    expect(google).not.toHaveBeenCalled();
  });
  it("tries free sources before Google and only requests missing categories", async () => {
    const calls: string[] = [];
    const google = vi.fn(async (kinds) => {
      calls.push("google");
      return rows(kinds);
    });
    const result = await loadLocalFirstDestinationCatalog({
      cached: [],
      local: async () => rows(["activity"]),
      publicSources: [
        async () => {
          calls.push("public");
          return rows(["restaurant"]);
        },
      ],
      google,
      normalize,
    });
    expect(calls).toEqual(["public", "google"]);
    expect(google).toHaveBeenCalledWith(["hotel"]);
    expect(result).toHaveLength(9);
  });
  it("keeps partial local results when all fallbacks fail", async () => {
    const result = await loadLocalFirstDestinationCatalog({
      cached: rows(["activity"]),
      local: async () => {
        throw Error();
      },
      publicSources: [
        async () => {
          throw Error();
        },
      ],
      google: async () => {
        throw Error();
      },
      normalize,
    });
    expect(result).toHaveLength(3);
  });
  it("does not call Google when public data fills the local gaps", async () => {
    const google = vi.fn();
    await loadLocalFirstDestinationCatalog({
      cached: [],
      local: async () => rows(["activity"]),
      publicSources: [async () => rows(["restaurant", "hotel"])],
      google,
      normalize,
    });
    expect(google).not.toHaveBeenCalled();
  });
});
