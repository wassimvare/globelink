import { afterEach, describe, expect, it } from "vitest";
import { authRedirect, safeInternalPath } from "./auth-redirects";
import { dailyContentKey, dailyRotation } from "./daily-content";
import { destinationCover } from "./destination-cover";

describe("safe authentication redirects", () => {
  const previousOrigin = process.env.PUBLIC_APP_URL;

  afterEach(() => {
    if (previousOrigin === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousOrigin;
  });

  it("accepts internal paths and rejects open redirects", () => {
    expect(safeInternalPath("/messages/123")).toBe("/messages/123");
    expect(safeInternalPath("//evil.example/path")).toBe("/");
    expect(safeInternalPath("https://evil.example/path")).toBe("/");
    expect(safeInternalPath("/safe\\evil")).toBe("/");
  });

  it("builds callbacks on the configured application origin", () => {
    process.env.PUBLIC_APP_URL = "https://globelink.example/some/path";
    expect(authRedirect("/verify-email")).toBe("https://globelink.example/verify-email");
    expect(authRedirect("//evil.example")).toBe("https://globelink.example/");
  });
});

describe("stable daily discovery", () => {
  const date = new Date("2026-08-05T23:59:00.000Z");

  it("uses UTC dates", () => {
    expect(dailyContentKey(date)).toBe("2026-08-05");
  });

  it("is deterministic and never mutates the source", () => {
    const source = Object.freeze(["a", "b", "c", "d", "e"]);
    const first = dailyRotation(source, 3, "home", date);
    const second = dailyRotation(source, 3, "home", date);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(3);
    expect(source).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("destination covers", () => {
  it("returns stable HTTPS images for known and unknown destinations", () => {
    const known = destinationCover("Japon");
    const fallback = destinationCover("Destination inconnue", "Ville inconnue");
    expect(known).toMatch(/^https:\/\//);
    expect(fallback).toMatch(/^https:\/\/images\.unsplash\.com\//);
    expect(destinationCover("Destination inconnue", "Ville inconnue")).toBe(fallback);
  });
});
