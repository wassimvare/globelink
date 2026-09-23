import { describe, expect, it } from "vitest";
import { buildTripInsert, isTripActive, selectFocusTrip, tripStatusLabel } from "./trip-domain";

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
  it("normalizes creation fields and decimal-comma budgets", () => {
    const insert = buildTripInsert("user-1", {
      title: "  Été indonésien  ",
      country: "  Indonésie ",
      city: " Jakarta ",
      budget: "3000,50",
      startsOn: "2026-07-05",
      endsOn: "2026-07-25",
      notes: "  Plongée et quad  ",
    });

    expect(insert.title).toBe("Été indonésien");
    expect(insert.country).toBe("Indonésie");
    expect(insert.city).toBe("Jakarta");
    expect(insert.budget).toBe(3000.5);
    expect(insert.notes).toBe("Plongée et quad");
  });

  it("rejects invalid trip dates and budgets", () => {
    const base = {
      title: "",
      country: "France",
      city: "",
      budget: "",
      startsOn: "",
      endsOn: "",
      notes: "",
    };

    expect(() =>
      buildTripInsert("user-1", { ...base, endsOn: "2026-10-10" }),
    ).toThrow(/date de départ/i);
    expect(() =>
      buildTripInsert("user-1", {
        ...base,
        startsOn: "2026-10-11",
        endsOn: "2026-10-10",
      }),
    ).toThrow(/date de retour/i);
    expect(() => buildTripInsert("user-1", { ...base, budget: "-10" })).toThrow(/budget/i);
    expect(() => buildTripInsert("user-1", { ...base, country: "   " })).toThrow(/pays/i);
  });
});
