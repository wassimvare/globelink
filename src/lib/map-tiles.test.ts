import { describe, expect, it } from "vitest";
import { MAP_TILE_ATTRIBUTION, MAP_TILE_MAX_ZOOM, MAP_TILE_URL } from "./map-tiles";

describe("map tile configuration", () => {
  it("uses the key-free OpenStreetMap tile endpoint", () => {
    expect(MAP_TILE_URL).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(MAP_TILE_URL).not.toContain("cartocdn");
    expect(MAP_TILE_URL).not.toMatch(/api[_-]?key|access[_-]?token|\?key=/i);
  });

  it("keeps the required attribution and supported zoom range", () => {
    expect(MAP_TILE_ATTRIBUTION).toContain("OpenStreetMap");
    expect(MAP_TILE_MAX_ZOOM).toBe(19);
  });
});
