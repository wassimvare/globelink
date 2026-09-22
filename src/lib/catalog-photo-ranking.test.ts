import { describe, expect, it } from "vitest";
import { rankCatalogPhotosForCard } from "./catalog-photo-ranking";

describe("rankCatalogPhotosForCard", () => {
  it("prefers a large card-friendly landscape photo over extreme crops", () => {
    const ranked = rankCatalogPhotosForCard([
      { name: "portrait", widthPx: 700, heightPx: 1600 },
      { name: "wide-panorama", widthPx: 2600, heightPx: 700 },
      { name: "landscape", widthPx: 1600, heightPx: 1200 },
    ]);

    expect(ranked.map((photo) => photo.name)).toEqual([
      "landscape",
      "wide-panorama",
      "portrait",
    ]);
  });

  it("keeps original order when dimensions are unavailable", () => {
    const ranked = rankCatalogPhotosForCard([
      { name: "first" },
      { name: "second" },
    ]);

    expect(ranked.map((photo) => photo.name)).toEqual(["first", "second"]);
  });

  it("drops candidates without a usable photo name", () => {
    const ranked = rankCatalogPhotosForCard([
      { name: "" },
      { widthPx: 1200, heightPx: 900 },
      { name: "valid", widthPx: 1200, heightPx: 900 },
    ]);

    expect(ranked.map((photo) => photo.name)).toEqual(["valid"]);
  });
});
