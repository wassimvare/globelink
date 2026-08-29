import fs from "node:fs";

const requiredFiles = [
  "e2e/authenticated-live.spec.ts",
  "e2e/critical-surfaces.spec.ts",
  ".github/workflows/quality.yml",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`[Phase 3 E2E] Fichier manquant: ${file}`);
    process.exit(1);
  }
}

const live = fs.readFileSync("e2e/authenticated-live.spec.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/quality.yml", "utf8");

const markers = [
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
  '"/trips"',
  '"/match"',
  '"/messages"',
  '"/notifications"',
  '"/settings"',
  '"/intelligence"',
  "deux comptes réels restent isolés",
];

for (const marker of markers) {
  if (!live.includes(marker)) {
    console.error(`[Phase 3 E2E] Contrat manquant dans authenticated-live.spec.ts: ${marker}`);
    process.exit(1);
  }
}

for (const secretName of [
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
]) {
  if (!workflow.includes(`secrets.${secretName}`)) {
    console.error(`[Phase 3 E2E] Secret non câblé dans le workflow: ${secretName}`);
    process.exit(1);
  }
}

if (!workflow.includes("authenticated-live.spec.ts")) {
  console.error("[Phase 3 E2E] Le workflow ne lance pas la suite authentifiée live.");
  process.exit(1);
}

console.log("[Phase 3 E2E] Contrat authentifié complet: 2 comptes, routes privées, isolation et CI.");
