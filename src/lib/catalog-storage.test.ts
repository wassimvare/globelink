import { describe, expect, it } from "vitest";
import { cachedCatalogImage } from "./catalog-storage";

const item = {
  tags: {
    catalog_image_storage_path: "openstreetmap/node/123/photo.jpg",
    catalog_image_status: "cached",
    catalog_image_source: "wikimedia-commons",
    catalog_image_license: "CC BY-SA 4.0",
    catalog_image_source_url: "https://commons.wikimedia.org/wiki/File:Photo.jpg",
  },
};
describe("migrated catalog photos", () => {
  it("uses the configured Raspberry origin instead of an old cloud image URL", () => {
    expect(cachedCatalogImage(item, "https://raspberrypi.tailaa3fb6.ts.net")).toBe(
      "https://raspberrypi.tailaa3fb6.ts.net/storage/v1/object/public/catalog-media/openstreetmap/node/123/photo.jpg",
    );
  });
  it("rejects traversal, unlicensed content, and lookalike attribution hosts", () => {
    for (const override of [
      { catalog_image_storage_path: "openstreetmap/../private.jpg" },
      { catalog_image_storage_path: "openstreetmap/%2e%2e/private.jpg" },
      { catalog_image_source_url: "https://commons.wikimedia.org.evil.test/photo" },
      { catalog_image_license: "All rights reserved" },
      { catalog_image_license: "CC BY-NC 4.0" },
    ])
      expect(
        cachedCatalogImage({ tags: { ...item.tags, ...override } }, "https://pi.example.com"),
      ).toBeNull();
  });
  it("does not expose internal HTTP URLs or embedded credentials", () => {
    expect(cachedCatalogImage(item, "http://kong:8000")).toBeNull();
    expect(cachedCatalogImage(item, "https://secret:password@pi.example.com")).toBeNull();
  });
});
