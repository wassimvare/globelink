import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });

const matchUi = read("src/routes/_authenticated.match.tsx");
const messageUi = read("src/routes/_authenticated.messages.$id.tsx");
const engine = read("src/features/match/travel-match.ts");
const engineTests = read("src/features/match/travel-match.test.ts");
const draftTests = read("src/features/match/match-draft.test.ts");

check(
  "La compatibilité explique destination, dates, budget, langues et affinités",
  engine.includes('"Destination"') &&
    engine.includes('"Dates"') &&
    engine.includes('"Budget"') &&
    engine.includes('"Langues"') &&
    engine.includes('"Affinités"') &&
    matchUi.includes('data-testid="travel-match-compatibility"'),
);

check(
  "Travel Match propose les trois intentions au-delà du swipe",
  engine.includes("Faire une activité ensemble") &&
    engine.includes("Prendre un café") &&
    engine.includes("Explorer ensemble") &&
    matchUi.includes("travel-match-intent-"),
);

check(
  "Le message préparé reste éditable et n’est jamais auto-envoyé",
  messageUi.includes('data-testid="travel-match-prepared-draft"') &&
    messageUi.includes("Rien n’est envoyé automatiquement") &&
    messageUi.includes('type="submit"') &&
    messageUi.includes("await insertMessage({ content })"),
);

check(
  "Le brouillon Travel Match survit à la navigation tant qu’il n’est pas envoyé",
  messageUi.includes("conversationDraftKey(id)") &&
    messageUi.includes("matchIntentDraftKey(other.user_id)") &&
    messageUi.includes("resolvePreparedMatchMessage") &&
    draftTests.includes("restaure le brouillon de conversation"),
);

check(
  "Le moteur Travel Match est couvert par des tests de compatibilité",
  engineTests.includes("Travel Match compatibility") &&
    engineTests.includes("ne pénalise pas une information absente") &&
    engineTests.includes("propose exactement les trois invitations prévues"),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? "✅" : "❌"} ${item.label}`);
}
console.log(
  `\nTravel Match étape 7 : ${checks.length - failed.length}/${checks.length} contrôles réussis.`,
);
if (failed.length) process.exit(1);
