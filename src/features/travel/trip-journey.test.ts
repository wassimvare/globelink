import { describe, expect, it } from "vitest";
import {
  buildTripDateRange,
  parseExpenseAmount,
  tripBudgetSnapshot,
  tripEntryIdentity,
} from "./trip-journey";

describe("trip journey helpers", () => {
  it("builds an inclusive trip date range without timezone drift", () => {
    expect(buildTripDateRange("2026-07-05", "2026-07-08")).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
  });

  it("rejects malformed or reversed date ranges", () => {
    expect(buildTripDateRange("2026-07-10", "2026-07-08")).toEqual([]);
    expect(buildTripDateRange("invalid", "2026-07-08")).toEqual([]);
  });

  it("normalizes Explorer entries for duplicate detection", () => {
    expect(
      tripEntryIdentity({ title: "Café de l’Été", city: "Lyon", country: "France" }),
    ).toBe(
      tripEntryIdentity({ title: "Cafe de l ete", city: "LYON", country: " france " }),
    );
  });

  it("accepts only positive finite expense amounts", () => {
    expect(parseExpenseAmount("12,50")).toBe(12.5);
    expect(parseExpenseAmount("0")).toBeNull();
    expect(parseExpenseAmount("-5")).toBeNull();
    expect(parseExpenseAmount("abc")).toBeNull();
  });

  it("keeps overspend information instead of clamping it away", () => {
    const snapshot = tripBudgetSnapshot({ budget: 100, spent: 125, forecast: 30 });
    expect(snapshot.spentPct).toBe(125);
    expect(snapshot.isOverBudget).toBe(true);
    expect(snapshot.projected).toBe(155);
    expect(snapshot.projectedRemaining).toBe(-55);
  });
});
