import { runNodeSequence } from "./lib/run-node-sequence.mjs";

runNodeSequence("GlobeLink patches", [
  "scripts/apply-v11-api-patch.mjs",
  "scripts/apply-free-public-catalog.mjs",
  "scripts/apply-destination-public-catalog.mjs",
  "scripts/apply-public-place-photo-fallback.mjs",
  "scripts/explorer-reliability-v1.mjs",
  "scripts/apply-recap-media-map-fix.mjs",
  "scripts/apply-recap-geocoder-v2.mjs",
  "scripts/apply-explorer-travel-map-v1.mjs",
  "scripts/add-to-trip-everywhere-v1.mjs",
  "scripts/apply-travel-match-v3.mjs",
  "scripts/simplify-home-v1.mjs",
  "scripts/apply-user-content-deletion.mjs",
  "scripts/apply-conversation-deletion.mjs",
  "scripts/performance-cleanup-v1.mjs",
]);
