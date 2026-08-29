import { runNodeSequence } from "./lib/run-node-sequence.mjs";

// Historical transforms retained only for explicit recovery/migration via
// `npm run patch:legacy`. Normal dev/build/check commands must never mutate src/.
runNodeSequence("GlobeLink legacy patches", [
  "scripts/apply-v11-api-patch.mjs",
  "scripts/apply-free-public-catalog.mjs",
  "scripts/apply-destination-public-catalog.mjs",
  "scripts/apply-public-place-photo-fallback.mjs",
  "scripts/explorer-reliability-v1.mjs",
  "scripts/apply-recap-geocoder-v2.mjs",
  "scripts/apply-explorer-travel-map-v1.mjs",
  "scripts/fix-explorer-add-to-trip-mobile-v1.mjs",
  "scripts/add-to-trip-everywhere-v1.mjs",
  "scripts/ai-readable-response-v1.mjs",
  "scripts/fix-trip-journal-days-v2.mjs",
  "scripts/run-trip-daily-program-v3.mjs",
  "scripts/apply-travel-match-v3.mjs",
  "scripts/journey-continuity-v1.mjs",
  "scripts/simplify-home-v1.mjs",
  "scripts/apply-user-content-deletion.mjs",
  "scripts/apply-conversation-deletion.mjs",
  "scripts/performance-cleanup-v1.mjs",
]);
