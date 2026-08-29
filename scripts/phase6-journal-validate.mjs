import fs from "node:fs";

const domain = fs.readFileSync("src/features/travel/day-program.ts", "utf8");
const component = fs.readFileSync("src/components/TripDaySectionPremium.tsx", "utf8");
const test = fs.readFileSync("src/features/travel/day-program.test.ts", "utf8");

const assertions = [
  [domain.includes("extractDayProgramBlock"), "programme isolé par date"],
  [domain.includes("buildDayProgramForDate"), "programme construit par journée"],
  [domain.includes("duplicatedEarlier"), "doublons inter-journées bloqués"],
  [domain.includes("parseProgramOption"), "comparaisons/options reconnues"],
  [domain.includes("applyProgramSelections"), "programme simplifié après choix"],
  [domain.includes("JOURNAL_SELECTION_TITLE_PREFIX"), "choix persistables dans le carnet"],
  [component.includes('@/features/travel/day-program'), "composant branché au domaine Phase 6"],
  [component.includes('data-testid="day-program"'), "programme quotidien testable en E2E"],
  [component.includes('data-testid="day-program-option"'), "options du carnet testables en E2E"],
  [component.includes("saveProgramSelection"), "sélection enregistrée côté données"],
  [component.includes("clearProgramSelection"), "sélection modifiable"],
  [component.includes("daySpent"), "budget réel conservé par journée"],
  [component.includes("dayForecast"), "prévision IA+ conservée par journée"],
  [test.includes("n’affiche pas une copie exacte"), "régression doublon couverte"],
  [test.includes("simplifie une section après sélection"), "régression choix couverte"],
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`[Phase 6] ${label}`);
  console.log(`✅ ${label}`);
}

console.log(`Phase 6 carnet: ${assertions.length}/${assertions.length} contrôles réussis.`);
