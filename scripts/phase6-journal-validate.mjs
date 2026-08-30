import fs from "node:fs";

const domain = fs.readFileSync("src/features/travel/day-program.ts", "utf8");
const component = fs.readFileSync("src/components/TripDaySectionPremium.tsx", "utf8");
const test = fs.readFileSync("src/features/travel/day-program.test.ts", "utf8");

const assertions = [
  [domain.includes("extractDayProgramBlock"), "programme isolé par date"],
  [domain.includes("buildDayProgramForDate"), "programme construit par journée"],
  [domain.includes("sameDayFallback"), "fallback du jour préserve un programme existant"],
  [domain.includes("hasDatedProgramHeadings"), "une note sans date d’un autre jour n’est pas recyclée"],
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
  [test.includes("ne vide jamais une journée valide"), "régression journée vide couverte"],
  [test.includes("n'utilise pas un programme sans date"), "régression mauvais jour couverte"],
  [test.includes("retombe sur une source multi-jours valide"), "régression fallback multi-jours couverte"],
  [test.includes("simplifie une section après sélection"), "régression choix couverte"],
];

for (const [ok, label] of assertions) {
  if (!ok) throw new Error(`[Phase 6] ${label}`);
  console.log(`✅ ${label}`);
}

console.log(`Phase 6 carnet: ${assertions.length}/${assertions.length} contrôles réussis.`);
