import { describe, expect, it } from "vitest";
import { isTripActive, selectFocusTrip, tripStatusLabel } from "./trip-domain";

describe("trip focus", () => {
  it("does not keep a finalized trip in the current-trip card", () => {
    const lyon = {
      id: "lyon",
      starts_on: "2026-08-29",
      ends_on: "2026-08-30",
      finalized_at: "2026-08-30T10:00:00.000Z",
    };

    expect(selectFocusTrip([lyon], "2026-08-30")).toBeNull();
    expect(isTripActive(lyon, "2026-08-30")).toBe(false);
  });

  it("selects the next non-finalized trip instead of finalized history", () => {
    const lyon = {
      id: "lyon",
      starts_on: "2026-08-29",
      ends_on: "2026-08-30",
      finalized_at: "2026-08-30T10:00:00.000Z",
    };
    const tunis = {
      id: "tunis",
      starts_on: "2026-11-05",
      ends_on: "2026-11-10",
      finalized_at: null,
    };

    expect(selectFocusTrip([lyon, tunis], "2026-08-30")).toBe(tunis);
  });

  it("labels the persisted past status as completed", () => {
    expect(tripStatusLabel("past")).toBe("Terminé");
  });
});
