import { describe, expect, it } from "vitest";
import {
  applyProgramSelections,
  buildDayProgramForDate,
  extractDayProgramBlock,
  journalSelectionsFromEntries,
  parseDayProgram,
  parseProgramOption,
} from "./day-program";

const multiDay = `### 2026-09-01
**Matin**
09:30 · Vieille ville
**Déjeuner**
Option A · Bistro du Lac
Option B · Café Central
**Après-midi**
14:30 · Balade au bord du lac
**Dîner**
19:30 · Restaurant du Port
**Hôtel**
22:00 · Hôtel Annecy

### 2026-09-02
**Matin**
09:00 · Marché local
**Déjeuner**
Option A · Chez Léon
Option B · La Terrasse
**Après-midi**
15:00 · Paddle
**Dîner**
20:00 · Le Quai
**Hôtel**
22:30 · Hôtel du Parc

## Budget
- total`;

describe("Phase 6 — carnet quotidien", () => {
  it("isole strictement le programme du jour demandé", () => {
    const day1 = extractDayProgramBlock(multiDay, "2026-09-01");
    const day2 = extractDayProgramBlock(multiDay, "2026-09-02");
    expect(day1).toContain("Vieille ville");
    expect(day1).not.toContain("Marché local");
    expect(day2).toContain("Marché local");
    expect(day2).not.toContain("Vieille ville");
  });

  it("structure matin, déjeuner, après-midi, dîner et hôtel", () => {
    const program = parseDayProgram(extractDayProgramBlock(multiDay, "2026-09-01"));
    expect(program.map((section) => section.key)).toEqual([
      "morning",
      "lunch",
      "afternoon",
      "dinner",
      "hotel",
    ]);
  });

  it("comprend aussi les blocs arrivée et départ ajoutés par IA+", () => {
    const program = parseDayProgram(`### Arrivée / Installation\n- Transfert puis installation\n### Dîner\n- Repas léger\n### Hôtel / Nuit\n- Hôtel Centre\n### Départ / Transfert\n- Check-out`);
    expect(program.map((section) => section.title)).toEqual([
      "Arrivée / Installation",
      "Dîner",
      "Hôtel / Nuit",
      "Départ / Transfert",
    ]);
  });

  it("reconnaît les options de comparaison et normalise une variante mal orthographiée", () => {
    expect(parseProgramOption("Option A · Bistro du Lac")).toEqual({
      label: "Option A",
      text: "Bistro du Lac",
    });
    expect(parseProgramOption("Optionen B · La Terrasse")).toEqual({
      label: "Option B",
      text: "La Terrasse",
    });
    expect(parseProgramOption("09:30 · Vieille ville")).toBeNull();
  });

  it("simplifie une section après sélection", () => {
    const program = parseDayProgram(extractDayProgramBlock(multiDay, "2026-09-01"));
    const simplified = applyProgramSelections(program, {
      lunch: { sectionKey: "lunch", optionLabel: "Option B", text: "Café Central" },
    });
    const lunch = simplified.find((section) => section.key === "lunch");
    expect(lunch?.items).toEqual(["Option B · Café Central"]);
  });

  it("relit les choix persistés dans les entrées du carnet", () => {
    const selections = journalSelectionsFromEntries([
      {
        kind: "note",
        title: "Carnet · Choix · lunch",
        notes: JSON.stringify({
          sectionKey: "lunch",
          optionLabel: "Option A",
          text: "Bistro du Lac",
        }),
      },
    ]);
    expect(selections.lunch?.text).toBe("Bistro du Lac");
  });

  it("ne vide jamais une journée valide uniquement parce que son programme ressemble à une autre journée", () => {
    const duplicate = `### 2026-09-01\n**Matin**\n09:00 · Même activité\n### 2026-09-02\n**Matin**\n09:00 · Même activité`;
    const allEntries = [
      { id: "day-1", kind: "note", title: "IA+ · Programme", notes: duplicate, visited_on: "2026-09-01" },
      { id: "day-2", kind: "note", title: "IA+ · Programme", notes: duplicate, visited_on: "2026-09-02" },
    ];
    expect(buildDayProgramForDate({ day: "2026-09-01", entries: [allEntries[0]], allEntries })).toHaveLength(1);
    expect(buildDayProgramForDate({ day: "2026-09-02", entries: [allEntries[1]], allEntries })).toHaveLength(1);
  });

  it("n'utilise pas un programme sans date appartenant à une autre journée", () => {
    const day2Only = {
      id: "day-2-only",
      kind: "note",
      title: "IA+ · Jour 2",
      notes: "**Matin**\n09:00 · Activité du jour 2",
      visited_on: "2026-09-02",
    };
    expect(buildDayProgramForDate({ day: "2026-09-01", entries: [], allEntries: [day2Only] })).toEqual([]);
  });

  it("retombe sur une source multi-jours valide si l'entrée directe du jour ne contient pas ce jour", () => {
    const brokenDirect = {
      id: "broken-day-1",
      kind: "note",
      title: "IA+ · Jour 1",
      notes: "### 2026-09-02\n**Matin**\n09:00 · Mauvais jour",
      visited_on: "2026-09-01",
    };
    const shared = {
      id: "shared-plan",
      kind: "note",
      title: "IA+ · Programme",
      notes: multiDay,
      visited_on: "2026-09-02",
    };
    const program = buildDayProgramForDate({
      day: "2026-09-01",
      entries: [brokenDirect],
      allEntries: [brokenDirect, shared],
    });
    expect(program.some((section) => section.items.some((item) => item.includes("Vieille ville")))).toBe(true);
  });
});
