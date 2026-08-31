import { describe, expect, it } from "vitest";
import { parseDayProgram } from "./day-program";

describe("carnet IA+ — nettoyage du programme", () => {
  it("transforme les titres markdown accidentellement placés dans des puces en vraies sections", () => {
    const raw = `### Arrivée / Installation
- Arrivée à destination, transfert vers l’hébergement et installation selon ton heure d’arrivée.
- ### Arrivée / Installation · Arrivée à Sousse, transfert vers l’hébergement et installation.
- ### Dîner · Option A · Repas à proximité de l’hôtel · estimation IA+ : env. 20 € total
- ### Hôtel / Nuit · Option A · Hôtel Sousse Palace · estimation IA+ : env. 90 € la nuit
### Dîner
- Repas à proximité de l’hébergement si ton heure d’arrivée le permet · estimation IA+ : env. 8–20 €/pers.
### Hôtel / Nuit
- Hébergement à confirmer pour cette nuit.`;

    const program = parseDayProgram(raw);

    expect(program.map((section) => section.title)).toEqual([
      "Arrivée / Installation",
      "Dîner",
      "Hôtel / Nuit",
    ]);
    expect(program.flatMap((section) => section.items).join("\n")).not.toContain("###");
    expect(program[0].items).toEqual([
      "Arrivée à Sousse, transfert vers l’hébergement et installation.",
    ]);
    expect(program[1].items).toEqual([
      "Option A · Repas à proximité de l’hôtel · estimation IA+ : env. 20 € total",
    ]);
    expect(program[2].items).toEqual([
      "Option A · Hôtel Sousse Palace · estimation IA+ : env. 90 € la nuit",
    ]);
  });
});
