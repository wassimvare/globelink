import { describe, expect, it } from "vitest";
import { shouldTryOpenKnowledgeFallback } from "./catalog-media-fallback";

describe("shouldTryOpenKnowledgeFallback", () => {
  it("allows traceable open-knowledge photos for places without a better photo", () => {
    expect(shouldTryOpenKnowledgeFallback({ kind: "activity" })).toBe(true);
    expect(shouldTryOpenKnowledgeFallback({ kind: "restaurant" })).toBe(true);
    expect(shouldTryOpenKnowledgeFallback({ kind: "hotel" })).toBe(true);
  });

  it("does not use place-photo fallback for deals", () => {
    expect(shouldTryOpenKnowledgeFallback({ kind: "deal" })).toBe(false);
  });

  it("can be disabled when a reliable cached photo already exists", () => {
    expect(
      shouldTryOpenKnowledgeFallback({ kind: "restaurant", skipOpenKnowledge: true }),
    ).toBe(false);
  });
});
