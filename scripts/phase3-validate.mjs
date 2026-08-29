import fs from "node:fs";

// Validation only: source transformations were frozen into src/ during Phase 1.
// A check must never mutate the repository before dev/build/test.
const checks = [
  ["src/routes/_authenticated.intelligence.tsx", ["GlobeLink IA", "Ton assistant voyage", "Gratuit", "IA+"]],
  ["src/lib/phase3-intelligence.functions.ts", ["organizeSmartDay", "getPhase3Context", "fetchWeather", "fetchTicketmasterEvents", "reserve_free_ai_usage"]],
  ["src/lib/phase3-intelligence.ts", ["calculatePhase3Compatibility", "weatherCodeLabel", "overlapDays"]],
  ["src/lib/phase3-intelligence.test.ts", ["score élevé", "codes météo"]],
];

let passed = 0;
for (const [file, markers] of checks) {
  if (!fs.existsSync(file)) {
    console.error(`[Phase 3] Fichier manquant: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(file, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) {
      console.error(`[Phase 3] Invariant manquant dans ${file}: ${marker}`);
      process.exit(1);
    }
    passed += 1;
  }
}

console.log(`[Phase 3] ${passed}/${checks.reduce((sum, [, markers]) => sum + markers.length, 0)} invariants validés sans mutation de source.`);
