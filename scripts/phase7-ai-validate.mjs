import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });

const freeServer = read("src/lib/ai-free.functions.ts");
const freeUi = read("src/routes/ai-trip.tsx");
const proServer = read("src/lib/ai-pro.functions.ts");
const proUi = read("src/routes/ai-pro.tsx");
const capabilities = read("src/features/ai/phase7-capabilities.ts");
const actions = read("src/features/ai/phase7-actions.ts");
const tests = read("src/features/ai/phase7-actions.test.ts");
const offers = read("src/features/ai/ai-offers.ts");
const offerTests = read("src/features/ai/ai-offers.test.ts");
const intelligenceUi = read("src/routes/_authenticated.intelligence.tsx");
const contextActions = read("src/components/AIContextActions.tsx");
const tripDayUi = read("src/components/TripDaySectionPremium.tsx");
const destinationUi = read("src/routes/destinations.$slug.tsx");
const mapUi = read("src/routes/map.tsx");
const countrySheet = read("src/components/CountrySheet.tsx");
const homeUi = read("src/routes/index.tsx");

check(
  "IA gratuite garde un périmètre explicite",
  capabilities.includes("FREE_AI_CAPABILITIES") &&
    freeServer.includes("detectPremiumIntent") &&
    freeServer.includes('tier: "free"') &&
    freeServer.includes("reserve_free_ai_usage"),
);
check(
  "IA gratuite ne prétend pas lire le carnet ou le temps réel",
  freeServer.includes("Tu ne consultes pas le carnet GlobeLink") &&
    freeServer.includes("tu n'effectues pas de recherche web approfondie ou en temps réel"),
);
check(
  "Le passage vers IA+ est contextuel",
  freeServer.includes("upgradeRecommended") &&
    freeUi.includes("turn.upgradeRecommended") &&
    freeUi.includes("Continuer avec IA+"),
);
check(
  "IA+ possède les capacités d'action produit",
  capabilities.includes("journal_apply") &&
    capabilities.includes("budget_optimization") &&
    capabilities.includes("full_daily_itinerary"),
);
check(
  "IA+ prépare un aperçu avant application",
  proServer.includes("buildAiPlusApplicationPreview") &&
    proServer.includes("applicationPreview:") &&
    proUi.includes("turn.applicationPreview"),
);
check(
  "IA+ applique le programme aux bonnes journées",
  proServer.includes("splitAiPlusProgramByDay") &&
    proServer.includes('.from("trip_days")') &&
    proServer.includes('.from("trip_entries")') &&
    ((proServer.includes("const dayNumber =") &&
      proServer.includes('title: `IA+ · Jour ${dayNumber}`')) ||
      proServer.includes('title: `IA+ · Jour ${index + 1}`')),
);
check(
  "IA+ applique les budgets comme prévisions séparées",
  proServer.includes("parseAiPlusBudgetForecasts") &&
    proServer.includes('.from("trip_expenses")') &&
    proServer.includes('category: "Prévision IA+"') &&
    proServer.includes("spent_on: forecast.day"),
);
check(
  "L'interface distingue appliquer et enregistrer",
  proUi.includes("Appliquer au carnet") && proUi.includes("Enregistrer le conseil"),
);
check(
  "Les parseurs Phase 7 sont couverts par des tests",
  actions.includes("splitAiPlusProgramByDay") &&
    actions.includes("parseAiPlusBudgetForecasts") &&
    tests.includes("sépare strictement les programmes par date") &&
    tests.includes("prévisions quotidiennes"),
);


check(
  "GlobeLink expose strictement deux offres IA",
  offers.includes("AI_OFFER_ORDER") &&
    offers.includes('id: "free"') &&
    offers.includes('id: "plus"') &&
    offerTests.includes("exposes exactly two user-facing offers") &&
    intelligenceUi.includes("AI_OFFERS.free") &&
    intelligenceUi.includes("AI_OFFERS.plus"),
);
check(
  "Les actions IA partagées pointent uniquement vers Gratuit et IA+",
  contextActions.includes("AI_OFFERS.free.route") &&
    contextActions.includes("AI_OFFERS.plus.route"),
);
check(
  "Chaque journée du carnet peut être organisée avec IA+",
  tripDayUi.includes("Organiser ma journée avec IA+") &&
    tripDayUi.includes('proMode="plan"') &&
    tripDayUi.includes("tripId={tripId}"),
);
check(
  "Les sélections d’hôtels proposent la comparaison IA+",
  destinationUi.includes("Comparer avec IA+") &&
    countrySheet.includes("Comparer avec IA+"),
);
check(
  "Explorer utilise une IA contextuelle au lieu d’un raccourci IA+ générique",
  mapUi.includes("AIContextActions") &&
    mapUi.includes("Vérifier avec IA+") &&
    !mapUi.includes('<Link to="/ai-pro">'),
);
check(
  "L’accueil transmet le prochain voyage à IA+",
  homeUi.includes("tripId={nextTrip.id}") &&
    homeUi.includes("Optimiser avec IA+"),
);
check(
  "Le passage du gratuit à IA+ conserve la demande",
  freeUi.includes("upgradePrompt: message") &&
    freeUi.includes("prompt: turn.upgradePrompt || undefined"),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? "✅" : "❌"} ${item.name}`);
console.log(`\nPhase 7 IA: ${checks.length - failed.length}/${checks.length} contrôles réussis.`);
if (failed.length) process.exit(1);
