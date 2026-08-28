import { runNodeSequence } from "./lib/run-node-sequence.mjs";

// Ces patchs étaient auparavant déclenchés comme effets de bord par vite.config.ts.
// Ils sont maintenant explicites et exécutés une seule fois avant les outils Vite.
runNodeSequence("GlobeLink late patches", [
  "scripts/simple-onboarding-v1.mjs",
  "scripts/apply-booking-hotel-policy.mjs",
  "scripts/apply-public-open-data.mjs",
]);
