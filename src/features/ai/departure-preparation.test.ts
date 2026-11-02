import { describe, expect, it } from "vitest";
import { DEPARTURE_PREPARATION_PROMPT, latestDepartureReport } from "./departure-preparation";

describe("fiche de préparation au voyage IA+", () => {
  it("demande une vérification des nationalités et des formalités", () => {
    expect(DEPARTURE_PREPARATION_PROMPT).toContain("nationalité");
    expect(DEPARTURE_PREPARATION_PROMPT).toContain("visa");
    expect(DEPARTURE_PREPARATION_PROMPT).toContain("sources officielles");
  });

  it("retrouve le dernier rapport enregistré et ignore les autres conseils", () => {
    const notes = `Notes manuelles

---

## ✨ IA+ · Préparation au départ
_2026-11-01_

## Avant de partir
Ancien rapport

---

## ✨ IA+ · Conseil enregistré depuis IA+
_2026-11-01_

Autre note

---

## ✨ IA+ · Préparation au départ
_2026-11-02_

## Avant de partir
Nouveau rapport

---

## ✨ IA+ · Conseil enregistré depuis IA+
_2026-11-02_

Encore autre note`;
    expect(latestDepartureReport(notes)).toBe("## Avant de partir\nNouveau rapport");
  });

  it("ne présente rien si aucune fiche n'a été enregistrée", () => {
    expect(latestDepartureReport("Autres notes")).toBeNull();
    expect(latestDepartureReport(null)).toBeNull();
  });
});
